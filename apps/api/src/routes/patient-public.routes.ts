import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import {
  EmailRoleConflictError,
  PatientAlreadyExistsError,
  VerifyPatientEntryTokenAuthError,
} from '@medical-crm/application';
import { NotFoundError } from '@medical-crm/utils';
import { getServices } from '../composition-root.js';
import { rateLimitByIp } from '../middleware/rate-limit.middleware.js';
import { initOnboardingSchema, matchHospitalsSchema } from '@medical-crm/validation';
import { seedWidgetStarterMessage } from './patient-widget-starter.js';

const app = new Hono();
const PATIENT_SESSION_COOKIE = 'patient_session';
const PATIENT_RESTORE_COOKIE = 'patient_restore';
const ONBOARDING_RATE_LIMIT = process.env.NODE_ENV === 'production'
  ? { maxRequests: 20, windowMs: 3600_000 } // 20 / hour in production
  : { maxRequests: 200, windowMs: 600_000 }; // 200 / 10 minutes in local/dev

const PROCEDURE_FALLBACK: Record<string, Array<{ id: string; name: string }>> = {
  face: [
    { id: 'face-eyelid-surgery', name: 'Eyelid Surgery' },
    { id: 'face-rhinoplasty', name: 'Rhinoplasty' },
    { id: 'face-revision-rhinoplasty', name: 'Revision Rhinoplasty' },
    { id: 'face-nose-tip-refinement', name: 'Nose Tip Refinement' },
    { id: 'face-facelift', name: 'Facelift' },
    { id: 'face-mini-facelift', name: 'Mini Facelift' },
    { id: 'face-midface-lift', name: 'Midface Lift (Mid Facelift)' },
    { id: 'face-neck-lift', name: 'Neck Lift' },
    { id: 'face-deep-neck-contouring', name: 'Deep Neck Contouring' },
    { id: 'face-brow-lift', name: 'Brow Lift' },
    { id: 'face-temples-lift', name: 'Temples Lift / Temporofrontal Lift' },
    { id: 'face-forehead-reduction-surgery', name: 'Forehead Reduction Surgery' },
    { id: 'face-cheek-augmentation', name: 'Cheek Augmentation' },
    { id: 'face-chin-augmentation', name: 'Chin Augmentation' },
    { id: 'face-jaw-contouring', name: 'Jaw Contouring' },
    { id: 'face-zygomatic-arch-contouring', name: 'Zygomatic Arch Contouring' },
    { id: 'face-otoplasty-ear-pinning', name: 'Otoplasty (Ear Pinning)' },
    { id: 'face-buccal-fat-removal', name: 'Buccal Fat Removal' },
    { id: 'face-renuvion-skin-tightening', name: 'Renuvion Skin Tightening Treatment' },
    { id: 'face-laser-liposuction', name: 'Laser Liposuction' },
    { id: 'face-skin-resurfacing', name: 'Skin Resurfacing' },
    { id: 'face-microdermabrasion', name: 'Microdermabrasion' },
    { id: 'face-facial-injectables', name: 'Facial Injectables' },
    { id: 'face-botox-neurotoxins', name: 'BOTOX & Neurotoxins' },
    { id: 'face-dermal-fillers', name: 'Dermal Fillers' },
    { id: 'face-fat-dissolving-injections', name: 'Fat Dissolving Injections' },
    { id: 'face-fat-transfer-facial', name: 'Fat Transfer (Facial Fat Grafting)' },
    { id: 'face-facial-rejuvenation-prp', name: 'Facial Rejuvenation with PRP' },
    { id: 'face-lip-filler', name: 'Lip Filler' },
    { id: 'face-lip-injections', name: 'Lip Injections' },
    { id: 'face-lip-augmentation', name: 'Lip Augmentation' },
    { id: 'face-lip-lift', name: 'Lip Lift' },
    { id: 'face-neck-liposuction', name: 'Neck Liposuction' },
    { id: 'face-neck-tightening', name: 'Neck Tightening' },
    { id: 'face-platysmaplasty', name: 'Platysmaplasty' },
    { id: 'face-cervicoplasty', name: 'Cervicoplasty' },
    { id: 'face-hair-restoration', name: 'Hair Restoration' },
    { id: 'face-mohs-reconstruction', name: 'Mohs Skin Cancer Reconstruction' },
    { id: 'face-facial-implants', name: 'Facial Implants' },
    { id: 'face-submalar-implants', name: 'Submalar Implants' },
  ],
  body: [
    { id: 'body-liposuction', name: 'Liposuction' },
    { id: 'body-tummy-tuck', name: 'Tummy Tuck' },
    { id: 'body-mommy-makeover', name: 'Mommy Makeover' },
    { id: 'body-scar-reduction-revision', name: 'Scar Reduction & Revision' },
    { id: 'body-renuvion-skin-tightening', name: 'Renuvion Skin Tightening Treatment' },
    { id: 'body-weight-loss-injections', name: 'Weight Loss Injections' },
    { id: 'body-arm-lift', name: 'Arm Lift' },
    { id: 'body-thigh-lift', name: 'Thigh Lift' },
    { id: 'body-bra-line-back-lift', name: 'Bra Line Back Lift' },
    { id: 'body-contouring-after-weight-loss', name: 'Body Contouring After Weight Loss' },
    { id: 'body-lower-body-lift-360', name: 'Lower Body Lift / 360 Body Lift' },
    { id: 'body-upper-body-lift', name: 'Upper Body Lift' },
    { id: 'body-panniculectomy', name: 'Panniculectomy' },
    { id: 'body-mons-pubis-reduction-lift', name: 'Mons Pubis Reduction / Lift' },
    { id: 'body-breast-augmentation', name: 'Breast Augmentation' },
    { id: 'body-breast-lift', name: 'Breast Lift' },
    { id: 'body-breast-reduction', name: 'Breast Reduction' },
    { id: 'body-breast-implant-removal-exchange-revision', name: 'Breast Implant Removal / Exchange & Revision' },
    { id: 'body-gynecomastia-surgery', name: 'Gynecomastia Surgery' },
    { id: 'body-brazilian-butt-lift', name: 'Brazilian Butt Lift (BBL)' },
    { id: 'body-buttock-lift', name: 'Buttock Lift' },
    { id: 'body-labiaplasty', name: 'Labiaplasty' },
    { id: 'body-aveli-cellulite-treatment', name: 'Aveli Cellulite Treatment' },
  ],
  'non-surgical': [
    { id: 'non-surgical-botox-cosmetic', name: 'BOTOX Cosmetic' },
    { id: 'non-surgical-botox-neurotoxins', name: 'BOTOX & Neurotoxins' },
    { id: 'non-surgical-fillers', name: 'Dermal Fillers' },
    { id: 'non-surgical-lip-injections', name: 'Lip Injections' },
    { id: 'non-surgical-lip-filler', name: 'Lip Filler' },
    { id: 'non-surgical-aveli-cellulite-treatment', name: 'Aveli Cellulite Treatment' },
    { id: 'non-surgical-skin-tightening', name: 'Non-surgical Skin Tightening' },
    { id: 'non-surgical-chemical-peels', name: 'Chemical Peels' },
    { id: 'non-surgical-skin-resurfacing', name: 'Skin Resurfacing' },
    { id: 'non-surgical-laser-skin-resurfacing', name: 'Laser Skin Resurfacing' },
    { id: 'non-surgical-microdermabrasion', name: 'Microdermabrasion' },
    { id: 'non-surgical-ipl-photofacial', name: 'IPL / Photofacial' },
    { id: 'non-surgical-laser-hair-removal', name: 'Laser Hair Removal' },
    { id: 'non-surgical-collagen-stimulators', name: 'Collagen Stimulators / Non-HA Fillers' },
    { id: 'non-surgical-microneedling', name: 'Microneedling' },
    { id: 'non-surgical-prp-prf', name: 'PRP / PRF' },
  ],
};

async function verifyTurnstileToken(token: string, remoteIp?: string): Promise<boolean> {
  void token;
  void remoteIp;
  return true;

  /*
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return process.env.NODE_ENV !== 'production';
  }

  const body = new URLSearchParams({
    secret,
    response: token,
  });
  if (remoteIp) {
    body.set('remoteip', remoteIp);
  }

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!response.ok) return false;
  const result = await response.json() as { success?: boolean };
  return Boolean(result.success);
  */
}

// POST /onboarding/init — rate limited
app.post('/onboarding/init', rateLimitByIp(ONBOARDING_RATE_LIMIT), async (c) => {
  const body = initOnboardingSchema.parse(await c.req.json());
  const remoteIp = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? undefined;
  const captchaValid = await verifyTurnstileToken(body.captchaToken ?? '', remoteIp);
  if (!captchaValid) {
    return c.json({ error: 'Captcha verification failed' }, 400);
  }

  const {
    initOnboarding,
    patientAuthService,
    getProfile,
    verifyPatientEntryToken,
  } = getServices();

  let authenticatedPatientId: string | undefined;
  const sessionToken = getCookie(c, PATIENT_SESSION_COOKIE);
  if (sessionToken) {
    try {
      const session = await patientAuthService.verifySessionToken(sessionToken);
      try {
        const profile = await getProfile.execute({
          userId: session.userId,
          email: '',
          role: 'PATIENT',
          hospitalId: null,
        });
        const normalizedSubmittedEmail = body.email.trim().toLowerCase();
        const normalizedSessionEmail = profile.email.trim().toLowerCase();

        authenticatedPatientId = normalizedSubmittedEmail === normalizedSessionEmail
          ? session.userId
          : undefined;
      } catch (error) {
        if (!(error instanceof NotFoundError)) {
          throw error;
        }
        authenticatedPatientId = undefined;
      }
    } catch {
      authenticatedPatientId = undefined;
    }
  }

  let verifiedRegisterEmail: string | undefined;
  if (body.registerToken) {
    let registerProof;
    try {
      registerProof = await verifyPatientEntryToken.execute({ token: body.registerToken });
    } catch (error) {
      if (error instanceof VerifyPatientEntryTokenAuthError) {
        return c.json({ error: 'Unauthorized' }, 401);
      }
      throw error;
    }
    if (registerProof.purpose !== 'patient-register') {
      return c.json({ error: 'Invalid token purpose' }, 400);
    }

    if (registerProof.email.trim().toLowerCase() !== body.email.trim().toLowerCase()) {
      return c.json({
        error: 'Register token email does not match submitted email',
        code: 'VALIDATION_FAILED',
      }, 400);
    }

    verifiedRegisterEmail = registerProof.email;
  }

  const { registerToken: _registerToken, ...onboardingInput } = body;
  let result;
  try {
    result = await initOnboarding.execute({
      ...onboardingInput,
      authenticatedPatientId,
      verifiedRegisterEmail,
    });
  } catch (error) {
    if (error instanceof PatientAlreadyExistsError || error instanceof EmailRoleConflictError) {
      return c.json({ error: error.message, code: error.code }, 409);
    }
    throw error;
  }

  setCookie(c, PATIENT_SESSION_COOKIE, result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 86400,
  });
  setCookie(c, PATIENT_RESTORE_COOKIE, result.restoreCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 86400,
  });

  try {
    await seedWidgetStarterMessage({
      services: getServices(),
      widgetSessionId: result.widgetChatTarget?.sessionId,
      caseId: result.caseId,
      destination: body.destination,
      category: body.category,
      procedureId: body.procedureId,
    });
  } catch (error) {
    console.warn('Failed to seed initial widget chatbot message:', error);
  }

  return c.json({
    patientId: result.patientId,
    caseId: result.caseId,
    nextStep: result.nextStep,
    isExistingPatient: result.isExistingPatient,
    restoreToken: result.restoreToken,
    widgetChatTarget: result.widgetChatTarget,
  });
});

// POST /match-hospitals
app.post('/match-hospitals', async (c) => {
  const body = matchHospitalsSchema.parse(await c.req.json());
  const { matchHospitals } = getServices();
  const result = await matchHospitals.execute(body);
  return c.json(result);
});

// GET /procedures
app.get('/procedures', async (c) => {
  const category = c.req.query('category');
  const normalizedCategory = (category && category in PROCEDURE_FALLBACK)
    ? category
    : null;

  if (normalizedCategory) {
    return c.json({ procedures: PROCEDURE_FALLBACK[normalizedCategory] ?? [] });
  }

  return c.json({
    procedures: Object.values(PROCEDURE_FALLBACK).flat(),
  });
});

// GET /destinations
app.get('/destinations', async (c) => {
  return c.json({
    destinations: ['Seoul', 'Bangkok', 'Tokyo', 'Shanghai', 'Singapore'],
  });
});

export default app;
