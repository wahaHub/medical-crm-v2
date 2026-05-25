'use client';

import { PortalLogin } from '@medical-crm/ui';
import { useHospitalI18n } from '@/lib/hospital-i18n';

export default function LoginPage() {
  const { t } = useHospitalI18n();

  return (
    <PortalLogin
      title={t('hospital.login.title', undefined, 'Medical CRM')}
      subtitle={t('hospital.login.subtitle', undefined, 'Unified Portal Login')}
      formTitle={t('hospital.login.formTitle', undefined, 'Sign in to your account')}
      usernameLabel={t('hospital.login.usernameLabel', undefined, 'Username / Email')}
      usernamePlaceholder={t(
        'hospital.login.usernamePlaceholder',
        undefined,
        'Enter username or email'
      )}
      passwordLabel={t('hospital.login.passwordLabel', undefined, 'Password')}
      passwordPlaceholder={t('hospital.login.passwordPlaceholder', undefined, 'Enter password')}
      submitLabel={t('hospital.login.submit', undefined, 'Sign In')}
      submittingLabel={t('hospital.login.submitting', undefined, 'Signing in...')}
      genericLoginFailedMessage={t(
        'hospital.login.errors.loginFailed',
        undefined,
        'Login failed'
      )}
      genericLoginErrorMessage={t(
        'hospital.login.errors.requestFailed',
        undefined,
        'An error occurred during login'
      )}
      missingCredentialsMessage={t(
        'hospital.login.errors.missingCredentials',
        undefined,
        'Username and password are required'
      )}
      invalidCredentialsMessage={t(
        'hospital.login.errors.invalidCredentials',
        undefined,
        'Invalid credentials'
      )}
      unauthorizedMessage={t(
        'hospital.login.errors.notAuthorized',
        undefined,
        'This account is not authorized for this portal'
      )}
      alternatePortalLabel={t(
        'hospital.login.alternatePortalLabel',
        undefined,
        'Go to Admin Portal'
      )}
      forgotPasswordHref="/auth/forgot-password"
      forgotPasswordLabel={t(
        'hospital.login.forgotPassword',
        undefined,
        'Forgot password?'
      )}
    />
  );
}
