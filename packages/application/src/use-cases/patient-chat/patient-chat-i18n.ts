export type PatientChatLocale = 'en' | 'zh';

type CopyKey =
  | 'action.viewProcess'
  | 'action.uploadRecords'
  | 'action.contactAdvisor'
  | 'action.openQuestionnaire'
  | 'action.selected'
  | 'composer.mechanical'
  | 'composer.human'
  | 'process.prompt'
  | 'process.confirmed'
  | 'process.dismissed'
  | 'upload.prompt'
  | 'upload.started'
  | 'upload.succeeded'
  | 'upload.failed'
  | 'advisor.handoff'
  | 'questionnaire.opened'
  | 'questionnaire.submitted';

const COPY: Record<PatientChatLocale, Record<CopyKey, string>> = {
  en: {
    'action.viewProcess': 'Learn the medical journey',
    'action.uploadRecords': 'Upload medical records',
    'action.contactAdvisor': 'Contact advisor',
    'action.openQuestionnaire': 'Fill medical form',
    'action.selected': 'Selected',
    'composer.mechanical': 'Use the menu above to continue. This flow will not send free text to AI.',
    'composer.human': 'Send a message to the care team.',
    'process.prompt': 'Please review the Medora Health medical journey before continuing.',
    'process.confirmed': 'You confirmed the Medora Health medical journey.',
    'process.dismissed': 'You can review the medical journey again whenever you are ready.',
    'upload.prompt': 'Please choose the medical records you want to upload. Your documents will be added to your Medora case.',
    'upload.started': 'Uploading medical records...',
    'upload.succeeded': 'Your medical records were uploaded. The care team will review them.',
    'upload.failed': 'Upload failed. Please try uploading the file again.',
    'advisor.handoff': 'Your request has been sent to the care team. An advisor will follow up with you.',
    'questionnaire.opened': 'Please complete the medical form so the care team can review your case.',
    'questionnaire.submitted': 'Your medical form has been submitted.',
  },
  zh: {
    'action.viewProcess': '了解就医流程',
    'action.uploadRecords': '上传医疗资料',
    'action.contactAdvisor': '联系顾问',
    'action.openQuestionnaire': '填写病情表',
    'action.selected': '已选择',
    'composer.mechanical': '请使用上方菜单继续；此流程不会发送自由输入给 AI。',
    'composer.human': '发送消息给顾问团队。',
    'process.prompt': '请先了解 Medora Health 赴华就医流程，然后继续。',
    'process.confirmed': '您已确认 Medora Health 就医流程。',
    'process.dismissed': '您可以随时再次查看就医流程。',
    'upload.prompt': '请选择要上传的医疗资料。资料会进入您的 Medora 病例。',
    'upload.started': '正在上传医疗资料...',
    'upload.succeeded': '您的医疗资料已上传，顾问团队会查看。',
    'upload.failed': '上传失败了，请重新上传这个文件。',
    'advisor.handoff': '您的请求已转交顾问团队，顾问会继续跟进。',
    'questionnaire.opened': '请填写病情表，方便顾问团队查看您的病例。',
    'questionnaire.submitted': '您的病情表已提交。',
  },
};

export function normalizePatientChatLocale(locale: string | null | undefined): PatientChatLocale {
  return locale?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function patientChatCopy(locale: string | null | undefined, key: CopyKey): string {
  return COPY[normalizePatientChatLocale(locale)][key];
}
