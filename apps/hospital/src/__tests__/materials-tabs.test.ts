import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function readMaterialsTabsSource() {
  return readFileSync(join(ROOT, 'apps/hospital/src/components/materials-tabs.tsx'), 'utf8');
}

describe('materials tabs hook ordering', () => {
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
