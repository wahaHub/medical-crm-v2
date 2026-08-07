export const PATIENT_CHAT_LOCALES = ['en', 'zh', 'es', 'fr', 'de', 'ru', 'ar', 'id'] as const;

export type PatientChatLocale = typeof PATIENT_CHAT_LOCALES[number];

export type PatientChatCopyKey =
  | 'starter.intakeReceived'
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
  | 'process.confirmationRecords'
  | 'upload.prompt'
  | 'upload.started'
  | 'upload.succeeded'
  | 'upload.failed'
  | 'advisor.handoff'
  | 'questionnaire.opened'
  | 'questionnaire.submitted';

const COPY: Record<PatientChatLocale, Record<PatientChatCopyKey, string>> = {
  en: {
    'starter.intakeReceived': 'Hello, welcome to Medora Health. We have received your basic intake information. If you have any medical records available, please upload them here. Our medical team will review your information and, when appropriate, arrange an online consultation with a doctor in China as soon as possible.',
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
    'process.confirmationRecords': 'Thank you for confirming the medical travel process. Next, please upload or describe any medical records you already have, such as diagnostic notes, referrals, imaging reports, pathology reports, laboratory results, discharge summaries, medication lists, and records of previous treatments or surgeries. Your information and attachments will be added securely to your case for review by our medical team.',
    'upload.prompt': 'Please choose the medical records you want to upload. Your documents will be added to your Medora case.',
    'upload.started': 'Uploading medical records...',
    'upload.succeeded': 'Your medical records were uploaded. The care team will review them.',
    'upload.failed': 'Upload failed. Please try uploading the file again.',
    'advisor.handoff': 'Your request has been sent to the care team. An advisor will follow up with you.',
    'questionnaire.opened': 'Please complete the medical form so the care team can review your case.',
    'questionnaire.submitted': 'Your medical form has been submitted.',
  },
  zh: {
    'starter.intakeReceived': '您好，欢迎来到 Medora Health。我们已收到您的基本问诊信息。如果您手头有任何医疗资料，请在此上传。我们的医疗团队会审阅您的信息，并在合适的情况下尽快为您安排与中国医生的线上面诊。',
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
    'process.confirmationRecords': '感谢您确认医疗旅行流程。下一步，请上传或文字说明您已有的医疗资料，例如诊断记录、转诊资料、影像检查报告、病理报告、化验结果、出院小结、当前用药清单，以及既往治疗或手术记录。您的信息和附件会安全地添加到病例中，供我们的医疗团队审阅。',
    'upload.prompt': '请选择要上传的医疗资料。资料会进入您的 Medora 病例。',
    'upload.started': '正在上传医疗资料...',
    'upload.succeeded': '您的医疗资料已上传，顾问团队会查看。',
    'upload.failed': '上传失败了，请重新上传这个文件。',
    'advisor.handoff': '您的请求已转交顾问团队，顾问会继续跟进。',
    'questionnaire.opened': '请填写病情表，方便顾问团队查看您的病例。',
    'questionnaire.submitted': '您的病情表已提交。',
  },
  es: {
    'starter.intakeReceived': 'Hola, le damos la bienvenida a Medora Health. Hemos recibido su información básica de admisión. Si tiene algún informe médico, puede cargarlo aquí. Nuestro equipo médico revisará su información y, cuando corresponda, organizará lo antes posible una consulta en línea con un médico en China.',
    'action.viewProcess': 'Conocer el proceso médico',
    'action.uploadRecords': 'Cargar informes médicos',
    'action.contactAdvisor': 'Contactar con un asesor',
    'action.openQuestionnaire': 'Completar el formulario médico',
    'action.selected': 'Seleccionado',
    'composer.mechanical': 'Utilice el menú de arriba para continuar. Este flujo no enviará texto libre a la IA.',
    'composer.human': 'Enviar un mensaje al equipo de atención.',
    'process.prompt': 'Revise el proceso de atención médica de Medora Health antes de continuar.',
    'process.confirmed': 'Ha confirmado el proceso de atención médica de Medora Health.',
    'process.dismissed': 'Puede volver a revisar el proceso médico cuando lo desee.',
    'process.confirmationRecords': 'Gracias por confirmar el proceso de viaje médico. A continuación, cargue o describa los informes médicos que ya tenga, como notas diagnósticas, derivaciones, informes de imagen, anatomía patológica, resultados de laboratorio, informes de alta, listas de medicamentos y antecedentes de tratamientos o cirugías. Su información y los archivos adjuntos se incorporarán de forma segura a su caso para que nuestro equipo médico los revise.',
    'upload.prompt': 'Seleccione los informes médicos que desea cargar. Los documentos se añadirán a su caso de Medora.',
    'upload.started': 'Cargando informes médicos...',
    'upload.succeeded': 'Sus informes médicos se han cargado. El equipo de atención los revisará.',
    'upload.failed': 'La carga ha fallado. Intente cargar el archivo de nuevo.',
    'advisor.handoff': 'Su solicitud se ha enviado al equipo de atención. Un asesor se pondrá en contacto con usted.',
    'questionnaire.opened': 'Complete el formulario médico para que el equipo de atención pueda revisar su caso.',
    'questionnaire.submitted': 'Su formulario médico ha sido enviado.',
  },
  fr: {
    'starter.intakeReceived': 'Bonjour et bienvenue chez Medora Health. Nous avons bien reçu vos informations médicales initiales. Si vous disposez de documents médicaux, vous pouvez les téléverser ici. Notre équipe médicale les examinera et, si cela est approprié, organisera dans les meilleurs délais une consultation en ligne avec un médecin en Chine.',
    'action.viewProcess': 'Découvrir le parcours médical',
    'action.uploadRecords': 'Téléverser des documents médicaux',
    'action.contactAdvisor': 'Contacter un conseiller',
    'action.openQuestionnaire': 'Remplir le formulaire médical',
    'action.selected': 'Sélectionné',
    'composer.mechanical': 'Utilisez le menu ci-dessus pour continuer. Ce parcours n’enverra pas de texte libre à l’IA.',
    'composer.human': 'Envoyer un message à l’équipe de soins.',
    'process.prompt': 'Veuillez consulter le parcours médical de Medora Health avant de continuer.',
    'process.confirmed': 'Vous avez confirmé le parcours médical de Medora Health.',
    'process.dismissed': 'Vous pourrez consulter de nouveau le parcours médical lorsque vous le souhaiterez.',
    'process.confirmationRecords': 'Merci d’avoir confirmé le processus de voyage médical. Veuillez maintenant téléverser ou décrire les documents médicaux dont vous disposez, tels que comptes rendus diagnostiques, lettres d’orientation, examens d’imagerie, rapports d’anatomopathologie, résultats de laboratoire, comptes rendus de sortie, listes de médicaments et antécédents de traitements ou d’interventions. Vos informations et pièces jointes seront ajoutées de manière sécurisée à votre dossier pour examen par notre équipe médicale.',
    'upload.prompt': 'Sélectionnez les documents médicaux à téléverser. Ils seront ajoutés à votre dossier Medora.',
    'upload.started': 'Téléversement des documents médicaux...',
    'upload.succeeded': 'Vos documents médicaux ont été téléversés. L’équipe de soins va les examiner.',
    'upload.failed': 'Le téléversement a échoué. Veuillez réessayer.',
    'advisor.handoff': 'Votre demande a été transmise à l’équipe de soins. Un conseiller vous contactera.',
    'questionnaire.opened': 'Veuillez remplir le formulaire médical afin que l’équipe de soins puisse examiner votre dossier.',
    'questionnaire.submitted': 'Votre formulaire médical a été envoyé.',
  },
  de: {
    'starter.intakeReceived': 'Hallo und willkommen bei Medora Health. Wir haben Ihre grundlegenden Angaben erhalten. Wenn Ihnen medizinische Unterlagen vorliegen, können Sie diese hier hochladen. Unser medizinisches Team prüft Ihre Informationen und organisiert, sofern sinnvoll, schnellstmöglich eine Online-Sprechstunde mit einem Arzt in China.',
    'action.viewProcess': 'Medizinischen Ablauf kennenlernen',
    'action.uploadRecords': 'Medizinische Unterlagen hochladen',
    'action.contactAdvisor': 'Berater kontaktieren',
    'action.openQuestionnaire': 'Medizinisches Formular ausfüllen',
    'action.selected': 'Ausgewählt',
    'composer.mechanical': 'Verwenden Sie das Menü oben, um fortzufahren. Freitext wird in diesem Ablauf nicht an die KI gesendet.',
    'composer.human': 'Nachricht an das Betreuungsteam senden.',
    'process.prompt': 'Bitte lesen Sie vor dem Fortfahren den medizinischen Ablauf von Medora Health.',
    'process.confirmed': 'Sie haben den medizinischen Ablauf von Medora Health bestätigt.',
    'process.dismissed': 'Sie können den medizinischen Ablauf jederzeit erneut ansehen.',
    'process.confirmationRecords': 'Vielen Dank, dass Sie den Ablauf Ihrer medizinischen Reise bestätigt haben. Laden Sie nun bitte vorhandene medizinische Unterlagen hoch oder beschreiben Sie diese, etwa Diagnosen, Überweisungen, Bildgebungsberichte, pathologische Befunde, Laborergebnisse, Entlassungsberichte, Medikamentenlisten sowie frühere Behandlungen oder Operationen. Ihre Angaben und Anhänge werden sicher zu Ihrem Fall hinzugefügt und von unserem medizinischen Team geprüft.',
    'upload.prompt': 'Wählen Sie die medizinischen Unterlagen aus, die Sie hochladen möchten. Sie werden Ihrem Medora-Fall hinzugefügt.',
    'upload.started': 'Medizinische Unterlagen werden hochgeladen...',
    'upload.succeeded': 'Ihre medizinischen Unterlagen wurden hochgeladen. Das Betreuungsteam wird sie prüfen.',
    'upload.failed': 'Der Upload ist fehlgeschlagen. Bitte versuchen Sie es erneut.',
    'advisor.handoff': 'Ihre Anfrage wurde an das Betreuungsteam weitergeleitet. Ein Berater wird sich bei Ihnen melden.',
    'questionnaire.opened': 'Bitte füllen Sie das medizinische Formular aus, damit das Betreuungsteam Ihren Fall prüfen kann.',
    'questionnaire.submitted': 'Ihr medizinisches Formular wurde übermittelt.',
  },
  ru: {
    'starter.intakeReceived': 'Здравствуйте! Добро пожаловать в Medora Health. Мы получили ваши основные данные. Если у вас есть медицинские документы, загрузите их здесь. Наша медицинская команда изучит информацию и, при наличии показаний, как можно скорее организует онлайн-консультацию с врачом в Китае.',
    'action.viewProcess': 'Ознакомиться с процессом лечения',
    'action.uploadRecords': 'Загрузить медицинские документы',
    'action.contactAdvisor': 'Связаться с консультантом',
    'action.openQuestionnaire': 'Заполнить медицинскую форму',
    'action.selected': 'Выбрано',
    'composer.mechanical': 'Чтобы продолжить, используйте меню выше. Свободный текст в этом режиме не отправляется ИИ.',
    'composer.human': 'Отправить сообщение команде сопровождения.',
    'process.prompt': 'Перед продолжением ознакомьтесь с процессом лечения Medora Health.',
    'process.confirmed': 'Вы подтвердили процесс лечения Medora Health.',
    'process.dismissed': 'Вы сможете снова открыть описание процесса лечения в любое время.',
    'process.confirmationRecords': 'Спасибо, что подтвердили процесс медицинской поездки. Теперь загрузите или опишите имеющиеся медицинские документы: диагностические заключения, направления, результаты визуализации, патологии и лабораторных исследований, выписки, списки лекарств, а также сведения о предыдущем лечении или операциях. Ваша информация и вложения будут безопасно добавлены в дело для изучения нашей медицинской командой.',
    'upload.prompt': 'Выберите медицинские документы для загрузки. Они будут добавлены в ваше дело Medora.',
    'upload.started': 'Медицинские документы загружаются...',
    'upload.succeeded': 'Ваши медицинские документы загружены. Команда сопровождения изучит их.',
    'upload.failed': 'Не удалось загрузить файл. Повторите попытку.',
    'advisor.handoff': 'Ваш запрос передан команде сопровождения. Консультант свяжется с вами.',
    'questionnaire.opened': 'Заполните медицинскую форму, чтобы команда сопровождения могла изучить ваш случай.',
    'questionnaire.submitted': 'Ваша медицинская форма отправлена.',
  },
  ar: {
    'starter.intakeReceived': 'مرحباً بكم في Medora Health. لقد استلمنا معلومات التقييم الأولية الخاصة بكم. إذا كانت لديكم أي سجلات طبية، يمكنكم رفعها هنا. سيقوم فريقنا الطبي بمراجعة المعلومات، وعند ملاءمة الحالة، سنرتب في أقرب وقت استشارة عبر الإنترنت مع طبيب في الصين.',
    'action.viewProcess': 'التعرّف على رحلة العلاج',
    'action.uploadRecords': 'رفع السجلات الطبية',
    'action.contactAdvisor': 'التواصل مع مستشار',
    'action.openQuestionnaire': 'تعبئة النموذج الطبي',
    'action.selected': 'تم الاختيار',
    'composer.mechanical': 'استخدموا القائمة أعلاه للمتابعة. لن يُرسل النص الحر إلى الذكاء الاصطناعي في هذا المسار.',
    'composer.human': 'إرسال رسالة إلى فريق الرعاية.',
    'process.prompt': 'يرجى مراجعة رحلة العلاج لدى Medora Health قبل المتابعة.',
    'process.confirmed': 'لقد أكدتم رحلة العلاج لدى Medora Health.',
    'process.dismissed': 'يمكنكم مراجعة رحلة العلاج مرة أخرى في أي وقت.',
    'process.confirmationRecords': 'شكراً لتأكيد عملية السفر الطبي. يرجى الآن رفع أو وصف السجلات الطبية المتوفرة لديكم، مثل ملاحظات التشخيص، والإحالات، وتقارير التصوير، وتقارير علم الأمراض، ونتائج المختبر، وملخصات الخروج، وقوائم الأدوية، وسجلات العلاجات أو العمليات السابقة. ستُضاف معلوماتكم ومرفقاتكم بأمان إلى ملف الحالة ليراجعها فريقنا الطبي.',
    'upload.prompt': 'يرجى اختيار السجلات الطبية التي تريدون رفعها. ستُضاف المستندات إلى ملفكم في Medora.',
    'upload.started': 'جارٍ رفع السجلات الطبية...',
    'upload.succeeded': 'تم رفع سجلاتكم الطبية. سيقوم فريق الرعاية بمراجعتها.',
    'upload.failed': 'فشل الرفع. يرجى محاولة رفع الملف مرة أخرى.',
    'advisor.handoff': 'تم إرسال طلبكم إلى فريق الرعاية. سيتابع معكم أحد المستشارين.',
    'questionnaire.opened': 'يرجى تعبئة النموذج الطبي حتى يتمكن فريق الرعاية من مراجعة حالتكم.',
    'questionnaire.submitted': 'تم إرسال النموذج الطبي.',
  },
  id: {
    'starter.intakeReceived': 'Halo, selamat datang di Medora Health. Kami telah menerima informasi awal Anda. Jika Anda memiliki rekam medis, silakan unggah di sini. Tim medis kami akan meninjau informasi tersebut dan, bila sesuai, mengatur konsultasi online dengan dokter di Tiongkok sesegera mungkin.',
    'action.viewProcess': 'Pelajari perjalanan perawatan',
    'action.uploadRecords': 'Unggah rekam medis',
    'action.contactAdvisor': 'Hubungi penasihat',
    'action.openQuestionnaire': 'Isi formulir medis',
    'action.selected': 'Dipilih',
    'composer.mechanical': 'Gunakan menu di atas untuk melanjutkan. Teks bebas tidak akan dikirim ke AI dalam alur ini.',
    'composer.human': 'Kirim pesan kepada tim perawatan.',
    'process.prompt': 'Tinjau perjalanan perawatan Medora Health sebelum melanjutkan.',
    'process.confirmed': 'Anda telah mengonfirmasi perjalanan perawatan Medora Health.',
    'process.dismissed': 'Anda dapat meninjau kembali perjalanan perawatan kapan saja.',
    'process.confirmationRecords': 'Terima kasih telah mengonfirmasi proses perjalanan medis. Selanjutnya, unggah atau jelaskan rekam medis yang Anda miliki, seperti catatan diagnosis, rujukan, laporan pencitraan, laporan patologi, hasil laboratorium, ringkasan pulang, daftar obat, serta catatan perawatan atau operasi sebelumnya. Informasi dan lampiran Anda akan ditambahkan dengan aman ke kasus untuk ditinjau oleh tim medis kami.',
    'upload.prompt': 'Pilih rekam medis yang ingin Anda unggah. Dokumen akan ditambahkan ke kasus Medora Anda.',
    'upload.started': 'Mengunggah rekam medis...',
    'upload.succeeded': 'Rekam medis Anda telah diunggah. Tim perawatan akan meninjaunya.',
    'upload.failed': 'Unggahan gagal. Silakan coba unggah kembali file tersebut.',
    'advisor.handoff': 'Permintaan Anda telah dikirim kepada tim perawatan. Seorang penasihat akan menghubungi Anda.',
    'questionnaire.opened': 'Lengkapi formulir medis agar tim perawatan dapat meninjau kasus Anda.',
    'questionnaire.submitted': 'Formulir medis Anda telah dikirim.',
  },
};

export function normalizePatientChatLocale(locale: string | null | undefined): PatientChatLocale {
  const normalized = (locale ?? '').trim().toLowerCase().split(/[-_]/)[0];
  return PATIENT_CHAT_LOCALES.includes(normalized as PatientChatLocale)
    ? normalized as PatientChatLocale
    : 'en';
}

export function patientChatCopy(locale: string | null | undefined, key: PatientChatCopyKey): string {
  return COPY[normalizePatientChatLocale(locale)][key];
}
