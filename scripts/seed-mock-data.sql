-- Mock data seed script for hospital portal testing
-- Two hospitals: 北京 (liuxue8805) and 上海 (shenqing8805)

BEGIN;

-- =====================================================
-- 1. Update hospitals to ACTIVE with proper details
-- =====================================================
UPDATE hospitals SET
  status = 'ACTIVE',
  name = '北京华美整形医院',
  name_en = 'Beijing Huamei Cosmetic Surgery Hospital',
  address = '北京市朝阳区建国路88号',
  phone = '+86-10-88886666',
  email = 'contact@bjhuamei.com',
  description = 'Leading cosmetic surgery center in Beijing specializing in facial reconstruction, body contouring, and anti-aging treatments.',
  specialties = '["Facial Surgery", "Body Contouring", "Rhinoplasty", "Breast Augmentation", "Anti-aging"]'::jsonb,
  updated_at = NOW()
WHERE id = 'e5a0bb10-d793-4d3a-8dec-2629aeeccbb3';

UPDATE hospitals SET
  status = 'ACTIVE',
  name = '上海仁济国际医疗中心',
  name_en = 'Shanghai Renji International Medical Center',
  address = '上海市浦东新区世纪大道1200号',
  phone = '+86-21-58885566',
  email = 'intl@shrenji.com',
  description = 'Comprehensive international medical center with advanced orthopedic, cardiac, and wellness treatment capabilities.',
  specialties = '["Orthopedic Surgery", "Cardiac Surgery", "Dental Implants", "Health Checkup", "Rehabilitation"]'::jsonb,
  type = 'REGULAR',
  updated_at = NOW()
WHERE id = '646e8684-ef6b-45ca-824c-52c1968a014c';

-- =====================================================
-- 2. Create patient users
-- =====================================================
INSERT INTO users (id, email, name, role, country, preferred_language, status, created_at, updated_at) VALUES
  ('a0000001-0000-0000-0000-000000000001', 'emma.wilson@example.com', 'Emma Wilson', 'PATIENT', 'United States', 'en', 'active', NOW() - INTERVAL '90 days', NOW()),
  ('a0000001-0000-0000-0000-000000000002', 'james.chen@example.com', 'James Chen', 'PATIENT', 'Canada', 'en', 'active', NOW() - INTERVAL '80 days', NOW()),
  ('a0000001-0000-0000-0000-000000000003', 'sarah.kim@example.com', 'Sarah Kim', 'PATIENT', 'South Korea', 'en', 'active', NOW() - INTERVAL '75 days', NOW()),
  ('a0000001-0000-0000-0000-000000000004', 'michael.brown@example.com', 'Michael Brown', 'PATIENT', 'United Kingdom', 'en', 'active', NOW() - INTERVAL '60 days', NOW()),
  ('a0000001-0000-0000-0000-000000000005', 'yuki.tanaka@example.com', 'Yuki Tanaka', 'PATIENT', 'Japan', 'en', 'active', NOW() - INTERVAL '50 days', NOW()),
  ('a0000001-0000-0000-0000-000000000006', 'lisa.johnson@example.com', 'Lisa Johnson', 'PATIENT', 'Australia', 'en', 'active', NOW() - INTERVAL '45 days', NOW()),
  ('a0000001-0000-0000-0000-000000000007', 'ahmed.hassan@example.com', 'Ahmed Hassan', 'PATIENT', 'United Arab Emirates', 'en', 'active', NOW() - INTERVAL '40 days', NOW()),
  ('a0000001-0000-0000-0000-000000000008', 'maria.garcia@example.com', 'Maria Garcia', 'PATIENT', 'Spain', 'en', 'active', NOW() - INTERVAL '35 days', NOW()),
  ('a0000001-0000-0000-0000-000000000009', 'david.lee@example.com', 'David Lee', 'PATIENT', 'Singapore', 'en', 'active', NOW() - INTERVAL '30 days', NOW()),
  ('a0000001-0000-0000-0000-000000000010', 'anna.mueller@example.com', 'Anna Mueller', 'PATIENT', 'Germany', 'en', 'active', NOW() - INTERVAL '25 days', NOW())
ON CONFLICT (email) DO NOTHING;

-- =====================================================
-- 3. Create admin user (for conversations)
-- =====================================================
INSERT INTO users (id, email, name, role, status, created_at, updated_at) VALUES
  ('a0000001-0000-0000-0000-000000000099', 'admin@medcrm.com', 'CRM Admin', 'ADMIN', 'active', NOW() - INTERVAL '180 days', NOW())
ON CONFLICT (email) DO NOTHING;

-- =====================================================
-- 4. Cases for 北京华美 (Beijing - cosmetic hospital)
-- =====================================================
INSERT INTO cases (id, case_number, patient_id, assigned_hospital_id, patient_name, patient_country, patient_language, primary_diagnosis, medical_history, ai_summary, risk_level, status, stage, assignment_status, created_at, updated_at) VALUES
  ('c0000001-0001-0000-0000-000000000001', 'CASE-2026-0101', 'a0000001-0000-0000-0000-000000000001', 'e5a0bb10-d793-4d3a-8dec-2629aeeccbb3',
   'Emma Wilson', 'United States', 'en', 'Rhinoplasty consultation', 'No prior surgeries. Deviated septum causing breathing issues.',
   'Patient seeks rhinoplasty for both cosmetic and functional reasons. Deviated septum with mild breathing obstruction. Good candidate for combined septorhinoplasty.',
   'LOW', 'ACTIVE', 'CONSULTATION_SCHEDULED', 'ASSIGNED', NOW() - INTERVAL '30 days', NOW()),

  ('c0000001-0001-0000-0000-000000000002', 'CASE-2026-0102', 'a0000001-0000-0000-0000-000000000002', 'e5a0bb10-d793-4d3a-8dec-2629aeeccbb3',
   'James Chen', 'Canada', 'en', 'Facial rejuvenation - facelift', 'Previous Botox treatments. Mild hypertension controlled with medication.',
   'Patient interested in full facelift with possible neck lift. History of Botox use. Blood pressure controlled. Pre-op clearance recommended.',
   'MEDIUM', 'ACTIVE', 'HOSPITAL_CONTACTED', 'ASSIGNED', NOW() - INTERVAL '25 days', NOW()),

  ('c0000001-0001-0000-0000-000000000003', 'CASE-2026-0103', 'a0000001-0000-0000-0000-000000000003', 'e5a0bb10-d793-4d3a-8dec-2629aeeccbb3',
   'Sarah Kim', 'South Korea', 'en', 'Breast augmentation', 'No significant medical history.',
   'Patient seeks breast augmentation. BMI within normal range. No contraindications identified. Silicone implants preferred.',
   'LOW', 'ACTIVE', 'IN_TREATMENT', 'ASSIGNED', NOW() - INTERVAL '45 days', NOW()),

  ('c0000001-0001-0000-0000-000000000004', 'CASE-2026-0104', 'a0000001-0000-0000-0000-000000000004', 'e5a0bb10-d793-4d3a-8dec-2629aeeccbb3',
   'Michael Brown', 'United Kingdom', 'en', 'Liposuction - abdomen and flanks', 'Type 2 diabetes (well-controlled). BMI 28.',
   'Patient interested in liposuction for abdominal area. Diabetes controlled with metformin. Requires endocrinologist clearance before proceeding.',
   'HIGH', 'ACTIVE', 'TRANSFERRED_TO_HOSPITAL', 'ASSIGNED', NOW() - INTERVAL '15 days', NOW()),

  ('c0000001-0001-0000-0000-000000000005', 'CASE-2026-0105', 'a0000001-0000-0000-0000-000000000005', 'e5a0bb10-d793-4d3a-8dec-2629aeeccbb3',
   'Yuki Tanaka', 'Japan', 'en', 'Double eyelid surgery (blepharoplasty)', 'No medical conditions.',
   'Patient seeks double eyelid surgery. Excellent candidate. Minimal risk procedure with fast recovery expected.',
   'LOW', 'COMPLETED', 'TREATMENT_COMPLETED', 'ASSIGNED', NOW() - INTERVAL '60 days', NOW());

-- =====================================================
-- 5. Cases for 上海仁济 (Shanghai - regular hospital)
-- =====================================================
INSERT INTO cases (id, case_number, patient_id, assigned_hospital_id, patient_name, patient_country, patient_language, primary_diagnosis, medical_history, ai_summary, risk_level, status, stage, assignment_status, created_at, updated_at) VALUES
  ('c0000002-0001-0000-0000-000000000001', 'CASE-2026-0201', 'a0000001-0000-0000-0000-000000000006', '646e8684-ef6b-45ca-824c-52c1968a014c',
   'Lisa Johnson', 'Australia', 'en', 'Total knee replacement', 'Osteoarthritis grade 3. Previous arthroscopic surgery 2023.',
   'Patient requires total knee replacement for advanced osteoarthritis. Previous scope showed significant cartilage loss. Physical therapy exhausted.',
   'MEDIUM', 'ACTIVE', 'CONSULTATION_SCHEDULED', 'ASSIGNED', NOW() - INTERVAL '20 days', NOW()),

  ('c0000002-0001-0000-0000-000000000002', 'CASE-2026-0202', 'a0000001-0000-0000-0000-000000000007', '646e8684-ef6b-45ca-824c-52c1968a014c',
   'Ahmed Hassan', 'United Arab Emirates', 'en', 'Cardiac bypass evaluation', 'Coronary artery disease. Previous stent placement 2024. Diabetes.',
   'Patient needs evaluation for CABG after recent angiogram showed multi-vessel disease. Two prior stents placed. Requires comprehensive cardiac workup.',
   'HIGH', 'ACTIVE', 'HOSPITAL_CONTACTED', 'ASSIGNED', NOW() - INTERVAL '10 days', NOW()),

  ('c0000002-0001-0000-0000-000000000003', 'CASE-2026-0203', 'a0000001-0000-0000-0000-000000000008', '646e8684-ef6b-45ca-824c-52c1968a014c',
   'Maria Garcia', 'Spain', 'en', 'Dental implants - full arch', 'No significant medical conditions. Severe periodontal disease.',
   'Patient requires full upper arch dental implant restoration. Bone density scan shows adequate jawbone for immediate load protocol.',
   'LOW', 'ACTIVE', 'IN_TREATMENT', 'ASSIGNED', NOW() - INTERVAL '40 days', NOW()),

  ('c0000002-0001-0000-0000-000000000004', 'CASE-2026-0204', 'a0000001-0000-0000-0000-000000000009', '646e8684-ef6b-45ca-824c-52c1968a014c',
   'David Lee', 'Singapore', 'en', 'Executive health screening', 'Family history of colorectal cancer. Otherwise healthy.',
   'Comprehensive health screening package requested. Family cancer history requires colonoscopy and tumor marker panels. Standard cardiac and metabolic workup.',
   'LOW', 'COMPLETED', 'TREATMENT_COMPLETED', 'ASSIGNED', NOW() - INTERVAL '50 days', NOW()),

  ('c0000002-0001-0000-0000-000000000005', 'CASE-2026-0205', 'a0000001-0000-0000-0000-000000000010', '646e8684-ef6b-45ca-824c-52c1968a014c',
   'Anna Mueller', 'Germany', 'en', 'Hip replacement consultation', 'Avascular necrosis of femoral head. Steroid use for autoimmune condition.',
   'Patient has AVN right hip due to prolonged steroid therapy. Imaging confirms stage 3 AVN. Total hip arthroplasty recommended.',
   'MEDIUM', 'ACTIVE', 'TRANSFERRED_TO_HOSPITAL', 'ASSIGNED', NOW() - INTERVAL '8 days', NOW());

-- =====================================================
-- 6. Consultations for 北京华美
-- =====================================================
INSERT INTO consultations (id, case_id, hospital_id, patient_id, status, scheduled_at, duration_minutes, ai_translation, patient_language, notes, created_at, updated_at) VALUES
  ('d0000001-0001-0000-0000-000000000001', 'c0000001-0001-0000-0000-000000000001', 'e5a0bb10-d793-4d3a-8dec-2629aeeccbb3', 'a0000001-0000-0000-0000-000000000001',
   'SCHEDULED', NOW() + INTERVAL '2 days', 30, true, 'en', 'Initial rhinoplasty consultation. Discuss surgical options and recovery.', NOW() - INTERVAL '5 days', NOW()),

  ('d0000001-0001-0000-0000-000000000002', 'c0000001-0001-0000-0000-000000000002', 'e5a0bb10-d793-4d3a-8dec-2629aeeccbb3', 'a0000001-0000-0000-0000-000000000002',
   'SCHEDULED', NOW() + INTERVAL '5 days', 45, true, 'en', 'Facelift pre-op evaluation. Review imaging and discuss procedure details.', NOW() - INTERVAL '3 days', NOW()),

  ('d0000001-0001-0000-0000-000000000003', 'c0000001-0001-0000-0000-000000000003', 'e5a0bb10-d793-4d3a-8dec-2629aeeccbb3', 'a0000001-0000-0000-0000-000000000003',
   'COMPLETED', NOW() - INTERVAL '10 days', 30, false, 'en', 'Breast augmentation consultation completed. Patient decided on silicone implants.', NOW() - INTERVAL '15 days', NOW()),

  ('d0000001-0001-0000-0000-000000000004', 'c0000001-0001-0000-0000-000000000005', 'e5a0bb10-d793-4d3a-8dec-2629aeeccbb3', 'a0000001-0000-0000-0000-000000000005',
   'COMPLETED', NOW() - INTERVAL '50 days', 20, true, 'en', 'Double eyelid surgery consultation. Patient cleared for procedure.', NOW() - INTERVAL '55 days', NOW()),

  ('d0000001-0001-0000-0000-000000000005', 'c0000001-0001-0000-0000-000000000004', 'e5a0bb10-d793-4d3a-8dec-2629aeeccbb3', 'a0000001-0000-0000-0000-000000000004',
   'CANCELLED', NOW() - INTERVAL '2 days', 30, true, 'en', 'Cancelled due to incomplete endocrinologist clearance. Rescheduling.', NOW() - INTERVAL '8 days', NOW());

-- =====================================================
-- 7. Consultations for 上海仁济
-- =====================================================
INSERT INTO consultations (id, case_id, hospital_id, patient_id, status, scheduled_at, duration_minutes, ai_translation, patient_language, notes, created_at, updated_at) VALUES
  ('d0000002-0001-0000-0000-000000000001', 'c0000002-0001-0000-0000-000000000001', '646e8684-ef6b-45ca-824c-52c1968a014c', 'a0000001-0000-0000-0000-000000000006',
   'SCHEDULED', NOW() + INTERVAL '3 days', 45, true, 'en', 'Pre-op knee replacement consultation. Review MRI results and surgical plan.', NOW() - INTERVAL '5 days', NOW()),

  ('d0000002-0001-0000-0000-000000000002', 'c0000002-0001-0000-0000-000000000002', '646e8684-ef6b-45ca-824c-52c1968a014c', 'a0000001-0000-0000-0000-000000000007',
   'SCHEDULED', NOW() + INTERVAL '7 days', 60, true, 'en', 'Cardiac evaluation. Review angiogram results and discuss CABG options.', NOW() - INTERVAL '3 days', NOW()),

  ('d0000002-0001-0000-0000-000000000003', 'c0000002-0001-0000-0000-000000000003', '646e8684-ef6b-45ca-824c-52c1968a014c', 'a0000001-0000-0000-0000-000000000008',
   'COMPLETED', NOW() - INTERVAL '20 days', 30, false, 'en', 'Dental implant planning session completed. CT scan reviewed. Surgery date confirmed.', NOW() - INTERVAL '25 days', NOW()),

  ('d0000002-0001-0000-0000-000000000004', 'c0000002-0001-0000-0000-000000000004', '646e8684-ef6b-45ca-824c-52c1968a014c', 'a0000001-0000-0000-0000-000000000009',
   'COMPLETED', NOW() - INTERVAL '40 days', 30, false, 'en', 'Health screening results review. All markers within normal range. Colonoscopy clear.', NOW() - INTERVAL '45 days', NOW());

-- =====================================================
-- 8. Conversations for 北京华美
-- =====================================================
INSERT INTO conversations (id, case_id, category, title, hospital_id, last_message_preview, last_message_at, created_at, updated_at) VALUES
  ('e0000001-0001-0000-0000-000000000001', 'c0000001-0001-0000-0000-000000000001', 'HOSPITAL_PATIENT', 'Emma Wilson - Rhinoplasty',
   'e5a0bb10-d793-4d3a-8dec-2629aeeccbb3', 'Thank you for the information. I will prepare the documents before the consultation.',
   NOW() - INTERVAL '1 day', NOW() - INTERVAL '28 days', NOW()),

  ('e0000001-0001-0000-0000-000000000002', 'c0000001-0001-0000-0000-000000000002', 'HOSPITAL_PATIENT', 'James Chen - Facelift',
   'e5a0bb10-d793-4d3a-8dec-2629aeeccbb3', 'My blood pressure has been stable. I can send my latest readings.',
   NOW() - INTERVAL '2 days', NOW() - INTERVAL '20 days', NOW()),

  ('e0000001-0001-0000-0000-000000000003', 'c0000001-0001-0000-0000-000000000003', 'ADMIN_HOSPITAL', 'Admin - Beijing Huamei: Case Updates',
   'e5a0bb10-d793-4d3a-8dec-2629aeeccbb3', 'Sarah Kim case has been updated to In Treatment stage.',
   NOW() - INTERVAL '3 days', NOW() - INTERVAL '40 days', NOW()),

  ('e0000001-0001-0000-0000-000000000004', 'c0000001-0001-0000-0000-000000000004', 'HOSPITAL_PATIENT', 'Michael Brown - Liposuction',
   'e5a0bb10-d793-4d3a-8dec-2629aeeccbb3', 'I have scheduled an appointment with my endocrinologist for next week.',
   NOW() - INTERVAL '5 days', NOW() - INTERVAL '12 days', NOW());

-- =====================================================
-- 9. Conversations for 上海仁济
-- =====================================================
INSERT INTO conversations (id, case_id, category, title, hospital_id, last_message_preview, last_message_at, created_at, updated_at) VALUES
  ('e0000002-0001-0000-0000-000000000001', 'c0000002-0001-0000-0000-000000000001', 'HOSPITAL_PATIENT', 'Lisa Johnson - Knee Replacement',
   '646e8684-ef6b-45ca-824c-52c1968a014c', 'I have uploaded my latest MRI report as requested.',
   NOW() - INTERVAL '1 day', NOW() - INTERVAL '18 days', NOW()),

  ('e0000002-0001-0000-0000-000000000002', 'c0000002-0001-0000-0000-000000000002', 'HOSPITAL_PATIENT', 'Ahmed Hassan - Cardiac Evaluation',
   '646e8684-ef6b-45ca-824c-52c1968a014c', 'My cardiologist has sent the referral letter. Please confirm receipt.',
   NOW() - INTERVAL '2 days', NOW() - INTERVAL '8 days', NOW()),

  ('e0000002-0001-0000-0000-000000000003', 'c0000002-0001-0000-0000-000000000003', 'ADMIN_HOSPITAL', 'Admin - Shanghai Renji: Maria Garcia Update',
   '646e8684-ef6b-45ca-824c-52c1968a014c', 'Dental implant surgery is confirmed for next Monday.',
   NOW() - INTERVAL '4 days', NOW() - INTERVAL '35 days', NOW());

-- =====================================================
-- 10. Messages for conversations (北京华美)
-- =====================================================
-- Conversation 1: Emma Wilson - Rhinoplasty
INSERT INTO messages (id, conversation_id, sender_id, content, original_language, translated_content, message_type, created_at) VALUES
  ('f0000001-0001-0000-0000-000000000001', 'e0000001-0001-0000-0000-000000000001', '8b4ad80c-77b9-4cad-b125-5d27d358c7e7',
   '您好 Emma，欢迎来到北京华美整形医院。我们已经收到您的鼻整形咨询申请，请问您方便提供一些术前照片吗？',
   'zh', 'Hello Emma, welcome to Beijing Huamei Cosmetic Surgery Hospital. We have received your rhinoplasty consultation request. Could you please provide some pre-operative photos?',
   'TEXT', NOW() - INTERVAL '27 days'),

  ('f0000001-0001-0000-0000-000000000002', 'e0000001-0001-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001',
   'Hello! Yes, I can send some photos. Should I take front and side views?',
   'en', '您好！是的，我可以发一些照片。我应该拍正面和侧面的吗？',
   'TEXT', NOW() - INTERVAL '26 days'),

  ('f0000001-0001-0000-0000-000000000003', 'e0000001-0001-0000-0000-000000000001', '8b4ad80c-77b9-4cad-b125-5d27d358c7e7',
   '是的，请拍正面、左右侧面和45度角的照片。另外，请将您的CT扫描结果也一起发过来。',
   'zh', 'Yes, please take front, left/right side, and 45-degree angle photos. Also, please send your CT scan results along with them.',
   'TEXT', NOW() - INTERVAL '25 days'),

  ('f0000001-0001-0000-0000-000000000004', 'e0000001-0001-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001',
   'Thank you for the information. I will prepare the documents before the consultation.',
   'en', '谢谢您提供的信息。我会在咨询前准备好这些文件。',
   'TEXT', NOW() - INTERVAL '1 day');

-- Conversation 2: James Chen - Facelift
INSERT INTO messages (id, conversation_id, sender_id, content, original_language, translated_content, message_type, created_at) VALUES
  ('f0000001-0002-0000-0000-000000000001', 'e0000001-0001-0000-0000-000000000002', '8b4ad80c-77b9-4cad-b125-5d27d358c7e7',
   '陈先生您好，我们注意到您有高血压病史。请问目前血压控制情况如何？能否提供最近的血压记录？',
   'zh', 'Hello Mr. Chen, we noticed you have a history of hypertension. How is your blood pressure control currently? Could you provide recent blood pressure readings?',
   'TEXT', NOW() - INTERVAL '20 days'),

  ('f0000001-0002-0000-0000-000000000002', 'e0000001-0001-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000002',
   'My blood pressure has been stable. I can send my latest readings.',
   'en', '我的血压一直很稳定。我可以发送我最新的血压记录。',
   'TEXT', NOW() - INTERVAL '2 days');

-- Conversation 3: Admin - Beijing Huamei
INSERT INTO messages (id, conversation_id, sender_id, content, original_language, translated_content, message_type, created_at) VALUES
  ('f0000001-0003-0000-0000-000000000001', 'e0000001-0001-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000099',
   'Please note: Sarah Kim (CASE-2026-0103) has arrived in Beijing and checked into the hotel. Surgery is scheduled for tomorrow.',
   'en', NULL, 'TEXT', NOW() - INTERVAL '38 days'),

  ('f0000001-0003-0000-0000-000000000002', 'e0000001-0001-0000-0000-000000000003', '8b4ad80c-77b9-4cad-b125-5d27d358c7e7',
   '收到，我们已经安排好了明天的手术团队。术前准备已完成。',
   'zh', 'Received, we have arranged the surgical team for tomorrow. Pre-operative preparations are complete.',
   'TEXT', NOW() - INTERVAL '37 days'),

  ('f0000001-0003-0000-0000-000000000003', 'e0000001-0001-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000099',
   'Sarah Kim case has been updated to In Treatment stage.',
   'en', NULL, 'TEXT', NOW() - INTERVAL '3 days');

-- =====================================================
-- 11. Messages for conversations (上海仁济)
-- =====================================================
-- Conversation 1: Lisa Johnson - Knee Replacement
INSERT INTO messages (id, conversation_id, sender_id, content, original_language, translated_content, message_type, created_at) VALUES
  ('f0000002-0001-0000-0000-000000000001', 'e0000002-0001-0000-0000-000000000001', '43405453-b45d-47ab-b1e2-c46fe7969965',
   'Johnson女士您好，我是上海仁济骨科的王医生。请问您能提供最近的膝关节MRI报告吗？',
   'zh', 'Hello Ms. Johnson, I am Dr. Wang from Renji Orthopedics. Could you provide your recent knee MRI report?',
   'TEXT', NOW() - INTERVAL '17 days'),

  ('f0000002-0001-0000-0000-000000000002', 'e0000002-0001-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000006',
   'Hello Dr. Wang! I have the MRI from last month. Let me upload it for you.',
   'en', '王医生您好！我有上个月的MRI。让我上传给您。',
   'TEXT', NOW() - INTERVAL '16 days'),

  ('f0000002-0001-0000-0000-000000000003', 'e0000002-0001-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000006',
   'I have uploaded my latest MRI report as requested.',
   'en', '我已经按要求上传了最新的MRI报告。',
   'TEXT', NOW() - INTERVAL '1 day');

-- Conversation 2: Ahmed Hassan - Cardiac
INSERT INTO messages (id, conversation_id, sender_id, content, original_language, translated_content, message_type, created_at) VALUES
  ('f0000002-0002-0000-0000-000000000001', 'e0000002-0001-0000-0000-000000000002', '43405453-b45d-47ab-b1e2-c46fe7969965',
   'Hassan先生，我们需要您的心脏科医生的转诊信和最近的冠状动脉造影报告。请尽快提供。',
   'zh', 'Mr. Hassan, we need a referral letter from your cardiologist and the recent coronary angiography report. Please provide them as soon as possible.',
   'TEXT', NOW() - INTERVAL '7 days'),

  ('f0000002-0002-0000-0000-000000000002', 'e0000002-0001-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000007',
   'My cardiologist has sent the referral letter. Please confirm receipt.',
   'en', '我的心脏科医生已经发了转诊信。请确认收到。',
   'TEXT', NOW() - INTERVAL '2 days');

-- =====================================================
-- 12. Documents for cases
-- =====================================================
-- Beijing cases
INSERT INTO documents (id, case_id, uploaded_by_id, file_name, file_size, mime_type, storage_key, document_type, sensitivity, language, status, created_at, updated_at) VALUES
  ('aa000001-0001-0000-0000-000000000001', 'c0000001-0001-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001',
   'CT_Scan_Nose.pdf', 2048576, 'application/pdf', 'cases/c0000001-0001/ct-scan-nose.pdf', 'IMAGING', 'PHI_HIGH', 'en', 'ACTIVE', NOW() - INTERVAL '25 days', NOW()),

  ('aa000001-0001-0000-0000-000000000002', 'c0000001-0001-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001',
   'Medical_History_Emma.pdf', 524288, 'application/pdf', 'cases/c0000001-0001/medical-history.pdf', 'OTHER', 'PHI_MED', 'en', 'ACTIVE', NOW() - INTERVAL '24 days', NOW()),

  ('aa000001-0001-0000-0000-000000000003', 'c0000001-0001-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000002',
   'Blood_Pressure_Log.pdf', 312456, 'application/pdf', 'cases/c0000001-0002/bp-log.pdf', 'OTHER', 'PHI_MED', 'en', 'ACTIVE', NOW() - INTERVAL '18 days', NOW()),

  ('aa000001-0001-0000-0000-000000000004', 'c0000001-0001-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000003',
   'Pre_Op_Lab_Results.pdf', 1048576, 'application/pdf', 'cases/c0000001-0003/lab-results.pdf', 'LAB', 'PHI_HIGH', 'en', 'ACTIVE', NOW() - INTERVAL '42 days', NOW()),

  ('aa000001-0001-0000-0000-000000000005', 'c0000001-0001-0000-0000-000000000005', '8b4ad80c-77b9-4cad-b125-5d27d358c7e7',
   'Post_Op_Report_Yuki.pdf', 786432, 'application/pdf', 'cases/c0000001-0005/post-op-report.pdf', 'DISCHARGE', 'PHI_HIGH', 'en', 'ACTIVE', NOW() - INTERVAL '48 days', NOW());

-- Shanghai cases
INSERT INTO documents (id, case_id, uploaded_by_id, file_name, file_size, mime_type, storage_key, document_type, sensitivity, language, status, created_at, updated_at) VALUES
  ('aa000002-0001-0000-0000-000000000001', 'c0000002-0001-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000006',
   'Knee_MRI_Report.pdf', 4096000, 'application/pdf', 'cases/c0000002-0001/knee-mri.pdf', 'IMAGING', 'PHI_HIGH', 'en', 'ACTIVE', NOW() - INTERVAL '15 days', NOW()),

  ('aa000002-0001-0000-0000-000000000002', 'c0000002-0001-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000006',
   'Previous_Surgery_Records.pdf', 1572864, 'application/pdf', 'cases/c0000002-0001/prev-surgery.pdf', 'OTHER', 'PHI_HIGH', 'en', 'ACTIVE', NOW() - INTERVAL '14 days', NOW()),

  ('aa000002-0001-0000-0000-000000000003', 'c0000002-0001-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000007',
   'Coronary_Angiogram.pdf', 5242880, 'application/pdf', 'cases/c0000002-0002/angiogram.pdf', 'IMAGING', 'PHI_HIGH', 'en', 'ACTIVE', NOW() - INTERVAL '8 days', NOW()),

  ('aa000002-0001-0000-0000-000000000004', 'c0000002-0001-0000-0000-000000000003', 'a0000001-0000-0000-0000-000000000008',
   'Dental_CT_Scan.pdf', 3145728, 'application/pdf', 'cases/c0000002-0003/dental-ct.pdf', 'IMAGING', 'PHI_MED', 'en', 'ACTIVE', NOW() - INTERVAL '38 days', NOW()),

  ('aa000002-0001-0000-0000-000000000005', 'c0000002-0001-0000-0000-000000000004', '43405453-b45d-47ab-b1e2-c46fe7969965',
   'Health_Screening_Report_David.pdf', 2097152, 'application/pdf', 'cases/c0000002-0004/screening-report.pdf', 'LAB', 'PHI_HIGH', 'en', 'ACTIVE', NOW() - INTERVAL '42 days', NOW());

-- =====================================================
-- 13. Case progress entries
-- =====================================================
-- Beijing cases
INSERT INTO case_progress (id, case_id, title, description, progress_type, recorded_at, recorded_by_id) VALUES
  ('ab000001-0001-0000-0000-000000000001', 'c0000001-0001-0000-0000-000000000001', 'Case Created', 'Patient Emma Wilson submitted rhinoplasty consultation request.', 'STATUS_CHANGE', NOW() - INTERVAL '30 days', NULL),
  ('ab000001-0001-0000-0000-000000000002', 'c0000001-0001-0000-0000-000000000001', 'Documents Uploaded', 'CT scan and medical history uploaded by patient.', 'DOCUMENT_UPLOAD', NOW() - INTERVAL '25 days', NULL),
  ('ab000001-0001-0000-0000-000000000003', 'c0000001-0001-0000-0000-000000000001', 'Consultation Scheduled', 'Video consultation scheduled with Dr. Li for rhinoplasty evaluation.', 'VIDEO_CONSULTATION', NOW() - INTERVAL '5 days', NULL),

  ('ab000001-0001-0000-0000-000000000004', 'c0000001-0001-0000-0000-000000000003', 'Surgery Completed', 'Breast augmentation surgery completed successfully. No complications.', 'STATUS_CHANGE', NOW() - INTERVAL '35 days', NULL),

  ('ab000001-0001-0000-0000-000000000005', 'c0000001-0001-0000-0000-000000000005', 'Treatment Completed', 'Double eyelid surgery completed. Patient cleared for discharge.', 'STATUS_CHANGE', NOW() - INTERVAL '48 days', NULL);

-- Shanghai cases
INSERT INTO case_progress (id, case_id, title, description, progress_type, recorded_at, recorded_by_id) VALUES
  ('ab000002-0001-0000-0000-000000000001', 'c0000002-0001-0000-0000-000000000001', 'Case Created', 'Patient Lisa Johnson referred for total knee replacement.', 'STATUS_CHANGE', NOW() - INTERVAL '20 days', NULL),
  ('ab000002-0001-0000-0000-000000000002', 'c0000002-0001-0000-0000-000000000001', 'MRI Uploaded', 'Knee MRI report uploaded by patient.', 'DOCUMENT_UPLOAD', NOW() - INTERVAL '15 days', NULL),

  ('ab000002-0001-0000-0000-000000000003', 'c0000002-0001-0000-0000-000000000003', 'Surgery Scheduled', 'Dental implant surgery confirmed for next Monday.', 'APPOINTMENT', NOW() - INTERVAL '4 days', NULL),

  ('ab000002-0001-0000-0000-000000000004', 'c0000002-0001-0000-0000-000000000004', 'Screening Complete', 'Executive health screening completed. All results normal.', 'STATUS_CHANGE', NOW() - INTERVAL '42 days', NULL);

-- =====================================================
-- 14. Update conversation last_message_id references
-- =====================================================
UPDATE conversations SET last_message_id = 'f0000001-0001-0000-0000-000000000004', last_sender_id = 'a0000001-0000-0000-0000-000000000001' WHERE id = 'e0000001-0001-0000-0000-000000000001';
UPDATE conversations SET last_message_id = 'f0000001-0002-0000-0000-000000000002', last_sender_id = 'a0000001-0000-0000-0000-000000000002' WHERE id = 'e0000001-0001-0000-0000-000000000002';
UPDATE conversations SET last_message_id = 'f0000001-0003-0000-0000-000000000003', last_sender_id = 'a0000001-0000-0000-0000-000000000099' WHERE id = 'e0000001-0001-0000-0000-000000000003';
UPDATE conversations SET last_message_id = 'f0000002-0001-0000-0000-000000000003', last_sender_id = 'a0000001-0000-0000-0000-000000000006' WHERE id = 'e0000002-0001-0000-0000-000000000001';
UPDATE conversations SET last_message_id = 'f0000002-0002-0000-0000-000000000002', last_sender_id = 'a0000001-0000-0000-0000-000000000007' WHERE id = 'e0000002-0001-0000-0000-000000000002';
UPDATE conversations SET last_message_id = 'f0000001-0003-0000-0000-000000000003', last_sender_id = 'a0000001-0000-0000-0000-000000000099' WHERE id = 'e0000002-0001-0000-0000-000000000003';

COMMIT;
