import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractSafeUserErrorDetail,
  formatUserFacingError,
} from '../components/materials-tabs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function readMaterialsTabsSource() {
  return readFileSync(join(ROOT, 'apps/hospital/src/components/materials-tabs.tsx'), 'utf8');
}

function readMaterialsPageSource() {
  return readFileSync(join(ROOT, 'apps/hospital/src/app/(portal)/materials/page.tsx'), 'utf8');
}

function readLocale(locale: string) {
  return JSON.parse(readFileSync(join(ROOT, `packages/shared/i18n/src/locales/${locale}.json`), 'utf8'));
}

function readNestedValue(source: Record<string, unknown>, path: string) {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (current && typeof current === 'object' && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, source);
}

describe('materials tabs hook ordering', () => {
  it('keeps only validation-style details and hides backend-ish messages', () => {
    const translate = (key: string, values?: Record<string, string | number>, fallback?: string) => {
      if (key === 'hospital.materials.errors.withDetail' && values) {
        return `${values.summary} Details: ${values.detail}`;
      }
      return fallback ?? key;
    };

    expect(extractSafeUserErrorDetail(new Error('Connection refused to database'))).toBeUndefined();
    expect(extractSafeUserErrorDetail(new Error('Name is required.'))).toBe('Name is required.');
    expect(extractSafeUserErrorDetail(new Error('Name is required.\nPlease try again.'))).toBeUndefined();

    expect(
      formatUserFacingError(
        new Error('Connection refused to database'),
        translate,
        'hospital.materials.surgeons.saveFailed',
        'Failed to save surgeon.',
      ),
    ).toBe('Failed to save surgeon.');

    expect(
      formatUserFacingError(
        new Error('Name is required.'),
        translate,
        'hospital.materials.surgeons.saveFailed',
        'Failed to save surgeon.',
      ),
    ).toBe('Failed to save surgeon. Details: Name is required.');

    expect(
      formatUserFacingError(
        new Error('Name is required.\nPlease try again.'),
        translate,
        'hospital.materials.surgeons.saveFailed',
        'Failed to save surgeon.',
      ),
    ).toBe('Failed to save surgeon.');
  });

  it('routes the materials page heading through translation keys', () => {
    const source = readMaterialsPageSource();

    expect(source).toContain("hospital.materials.page.title");
    expect(source).toContain("hospital.materials.page.description");
  });

  it('declares the HospitalInfoTab sync effect before the loading early return', () => {
    const source = readMaterialsTabsSource();

    const hospitalInfoTabStart = source.indexOf('function HospitalInfoTab');
    const syncEffect = source.indexOf('// Sync array/chip state from loaded data when data first loads');
    const loadingReturn = source.indexOf('if (isLoading) {', hospitalInfoTabStart);

    expect(hospitalInfoTabStart).toBeGreaterThan(-1);
    expect(syncEffect).toBeGreaterThan(hospitalInfoTabStart);
    expect(loadingReturn).toBeGreaterThan(hospitalInfoTabStart);
    expect(syncEffect).toBeLessThan(loadingReturn);
  });

  it('makes the surgeon modal body scroll within the viewport', () => {
    const source = readMaterialsTabsSource();

    expect(source).toContain('max-h-[80vh] overflow-y-auto');
  });

  it('tracks hospital photos in editable state so deletes persist on save', () => {
    const source = readMaterialsTabsSource();

    expect(source).toContain("const [photos, setPhotos] = useState<EditablePhoto[]>([])");
    expect(source).toContain('setPhotos((info.photos ?? []).map((url: string, index: number) => ({');
    expect(source).toContain('photos: nextPhotos.map((photo) => photo.storageKey ?? photo.previewUrl),');
    expect(source).toContain("setPhotos((prev) => prev.filter((_, idx) => idx !== i));");
  });

  it('keeps video upload controls enabled and uploads hospital media on save', () => {
    const source = readMaterialsTabsSource();

    expect(source).not.toContain('{!isRegular && (');
    expect(source).toContain('const uploadTasks: Array<{');
    expect(source).toContain("const asset = await uploadMaterialAsset(file, 'hospital_video');");
    expect(source).toContain("const asset = await uploadMaterialAsset(pending.file, 'testimonial_video');");
    expect(source).toContain('<UploadProgressModal');
    expect(source).toContain('Dismiss and locate issue');
  });

  it('shows raw backend validation logs in the save modal before dismissing failed hospital saves', () => {
    const source = readMaterialsTabsSource();

    expect(source).toContain('Technical debug logs');
    expect(source).toContain('state.debugDetails');
    expect(source).toContain('JSON.stringify(error.body, null, 2)');
    expect(source).toContain('showDebugDetails: true');
  });

  it('supports clearing hero, department, and equipment images in edit mode', () => {
    const source = readMaterialsTabsSource();

    expect(source).toContain("onClick={() => onChange('')}");
    expect(source).toContain('const hasLocalDeptImage = Object.prototype.hasOwnProperty.call(deptImages, deptValue);');
    expect(source).toContain("setDeptImages((prev) => ({ ...prev, [deptValue]: '' }));");
  });

  it('uses upload-only image widgets for hero and equipment images', () => {
    const source = readMaterialsTabsSource();

    expect(source).toContain('allowDirectUrl = true');
    expect(source).toContain('allowDirectUrl={false}');
  });

  it('uses fixed dropdown options for regular hospital classification fields', () => {
    const source = readMaterialsTabsSource();

    expect(source).toContain('function getHospitalTierOptions');
    expect(source).toContain('function getOwnershipTypeOptions');
    expect(source).toContain('const hospitalTierOptions = getHospitalTierOptions(t);');
    expect(source).toContain('const ownershipTypeOptions = getOwnershipTypeOptions(t);');
    expect(source).toContain("options: hospitalTierOptions");
    expect(source).toContain("options: ownershipTypeOptions");
  });

  it('uses upload-only and multi-select controls in the surgeon modal', () => {
    const source = readMaterialsTabsSource();

    expect(source).toContain('function getSurgeonLanguageOptions');
    expect(source).toContain('const specialtyOptions = isRegular ? departmentOptions : procedureOptions;');
    expect(source).toContain('getSurgeonLanguageOptions(t)');
    expect(source).toContain('allowDirectUrl={false}');
    expect(source).toContain('<MultiSelectDropdown');
    expect(source).toContain("placeholder={tx('hospital.materials.surgeons.searchPlaceholderSpecialties'");
    expect(source).toContain("placeholder={tx('hospital.materials.surgeons.searchPlaceholderLanguages'");
  });

  it('routes the remaining hospital info, procedures, surgeons, and cases chrome through translation keys', () => {
    const source = readMaterialsTabsSource();

    expect(source).toContain("hospital.materials.hospitalInfo.classificationTitle");
    expect(source).toContain("hospital.materials.procedures.emptyTitle");
    expect(source).toContain("hospital.materials.procedures.searchPlaceholder");
    expect(source).toContain("hospital.materials.surgeons.loadFailedTitle");
    expect(source).toContain("hospital.materials.surgeons.searchPlaceholder");
    expect(source).toContain("hospital.materials.cases.loadFailedTitle");
    expect(source).toContain("hospital.materials.cases.searchPlaceholder");
  });

  it('routes surgeon and case error states through localized summaries instead of raw messages', () => {
    const source = readMaterialsTabsSource();
    const scopedSource = source.slice(source.indexOf('function SurgeonsTab()'));

    expect(scopedSource).toContain('formatUserFacingError(');
    expect(scopedSource).toContain('hospital.materials.surgeons.loadFailedDescription');
    expect(scopedSource).toContain('hospital.materials.uploadProgress.uploadFailed');
    expect(scopedSource).toContain('hospital.materials.surgeons.saveFailed');
    expect(scopedSource).toContain('hospital.materials.cases.loadFailedDescription');
    expect(scopedSource).toContain('hospital.materials.cases.saveFailed');
    expect(scopedSource).not.toContain('error.message');
  });

  it('routes procedures loading, row actions, and save-state labels through translation keys', () => {
    const source = readMaterialsTabsSource();

    expect(source).toContain("hospital.materials.procedures.loadingProcedures");
    expect(source).toContain("hospital.materials.buttons.edit");
    expect(source).toContain("hospital.materials.buttons.delete");
    expect(source).toContain("hospital.materials.buttons.saving");
  });

  it('routes the materials shell and hospital info chrome through translation keys', () => {
    const source = readMaterialsTabsSource();

    expect(source).toContain("hospital.materials.tabs.info");
    expect(source).toContain("hospital.materials.consumerWebsite.title");
    expect(source).toContain("hospital.materials.consumerWebsite.regularDescription");
    expect(source).toContain("hospital.materials.consumerWebsite.defaultDescription");
    expect(source).toContain("hospital.materials.reviewBanner.title");
    expect(source).toContain("hospital.materials.reviewBanner.description");
    expect(source).toContain("hospital.materials.operatingHours.title");
    expect(source).toContain("hospital.materials.actions.add");
    expect(source).toContain("hospital.materials.hospitalInfo.classificationTitle");
    expect(source).toContain("hospital.materials.hospitalInfo.geographicTitle");
    expect(source).toContain("hospital.materials.hospitalInfo.certificationsTitle");
    expect(source).toContain("hospital.materials.hospitalInfo.selectPaymentMethods");
    expect(source).toContain("hospital.materials.hints.departmentImage");
    expect(source).toContain("hospital.materials.placeholders.keyServices");
  });

  it('defines the newly routed page and hospital info keys in every locale bundle', () => {
    const locales = ['en', 'zh', 'fr', 'de', 'es', 'bn'];
    const scopedKeys = [
      'hospital.materials.page.title',
      'hospital.materials.page.description',
      'hospital.materials.tabs.info',
      'hospital.materials.consumerWebsite.title',
      'hospital.materials.consumerWebsite.defaultDescription',
      'hospital.materials.consumerWebsite.regularDescription',
      'hospital.materials.reviewBanner.title',
      'hospital.materials.reviewBanner.description',
      'hospital.materials.reviewBanner.aiReview',
      'hospital.materials.reviewBanner.translation',
      'hospital.materials.operatingHours.title',
      'hospital.materials.operatingHours.weekdays',
      'hospital.materials.operatingHours.closed',
      'hospital.materials.operatingHours.none',
      'hospital.materials.hospitalInfo.classificationTitle',
      'hospital.materials.hospitalInfo.geographicTitle',
      'hospital.materials.hospitalInfo.certificationsTitle',
      'hospital.materials.hospitalInfo.multilingualStaffTitle',
      'hospital.materials.hospitalInfo.airportServicesTitle',
      'hospital.materials.hospitalInfo.amenitiesTitle',
      'hospital.materials.hospitalInfo.paymentMethodsTitle',
      'hospital.materials.hospitalInfo.followUpCareTitle',
      'hospital.materials.hints.departmentImage',
      'hospital.materials.placeholders.keyServices',
      'hospital.materials.errors.withDetail',
      'hospital.materials.save.failure',
      'hospital.materials.save.failureWithDebug',
    ];

    for (const locale of locales) {
      const bundle = readLocale(locale);

      for (const key of scopedKeys) {
        expect(readNestedValue(bundle, key), `${locale} is missing ${key}`).toBeDefined();
      }
    }
  });

  it('defines procedures locale keys needed by the scoped UI in every locale bundle', () => {
    const locales = ['en', 'zh', 'fr', 'de', 'es', 'bn'];
    const scopedKeys = [
      'hospital.materials.procedures.loadingProcedures',
      'hospital.materials.procedures.defaultCurrency',
      'hospital.materials.buttons.cancel',
      'hospital.materials.buttons.delete',
      'hospital.materials.buttons.edit',
      'hospital.materials.buttons.saving',
    ];

    for (const locale of locales) {
      const bundle = readLocale(locale);

      for (const key of scopedKeys) {
        expect(readNestedValue(bundle, key), `${locale} is missing ${key}`).toBeDefined();
      }

      expect(
        readNestedValue(bundle, 'hospital.materials.procedures.defaultCurrency'),
        `${locale} should keep the default procedure currency code stable`,
      ).toBe('USD');
    }
  });

  it('defines the surgeon and case error locale keys in every locale bundle', () => {
    const locales = ['en', 'zh', 'fr', 'de', 'es', 'bn'];
    const scopedKeys = [
      'hospital.materials.surgeons.loadFailedDescription',
      'hospital.materials.surgeons.saveFailed',
      'hospital.materials.cases.loadFailedDescription',
      'hospital.materials.cases.saveFailed',
      'hospital.materials.uploadProgress.uploadFailed',
    ];

    for (const locale of locales) {
      const bundle = readLocale(locale);

      for (const key of scopedKeys) {
        expect(readNestedValue(bundle, key), `${locale} is missing ${key}`).toBeDefined();
      }
    }
  });

  it('keeps scoped locale strings free of pasted TSX or function source', () => {
    const locales = ['en', 'zh', 'fr', 'de', 'es', 'bn'];
    const keys = [
      'hospital.materials.errors.withDetail',
      'hospital.materials.actions.doneSelected',
      'hospital.materials.departments.annualPatientsCount',
      'hospital.materials.reviewBanner.description',
      'hospital.materials.save.failureWithDebug',
      'hospital.materials.save.uploadDepartmentImage',
      'hospital.materials.save.uploadEquipmentImage',
      'hospital.materials.save.uploadHeroImage',
      'hospital.materials.save.uploadHospitalPhoto',
      'hospital.materials.save.uploadPromotionalVideo',
      'hospital.materials.save.uploadTestimonialVideo',
    ];
    const forbiddenFragments = [
      'className=',
      'function ',
      'return ',
      'targetKey:',
      'uploadMaterialAsset(',
      '</',
      '<div',
      '<button',
      '<Modal',
      'onChange=',
    ];

    for (const locale of locales) {
      const bundle = readLocale(locale);

      for (const key of keys) {
        const value = readNestedValue(bundle, key);

        expect(typeof value, `${locale} ${key} should be a plain string`).toBe('string');
        expect(String(value)).not.toContain('\n');

        for (const fragment of forbiddenFragments) {
          expect(String(value), `${locale} ${key} contains ${fragment}`).not.toContain(fragment);
        }
      }
    }
  });

  it('keeps surgeon language values locale-stable instead of storing translated labels', () => {
    const source = readMaterialsTabsSource();

    expect(source).toContain('value: option.value');
    expect(source).not.toContain('value: option.label');
  });

  it('uses upload-only case photos in the case study modal', () => {
    const source = readMaterialsTabsSource();

    expect(source).toContain('Upload multiple photos to build the case gallery.');
    expect(source).not.toContain('Upload multiple photos or add image URLs.');
    expect(source).toContain("Ready to upload on save");
  });
});
