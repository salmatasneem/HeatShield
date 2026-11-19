import { WorkerLanguageCode } from '../types/occupational';

export type DashboardLocale = 'en' | 'ar';

export interface WorkerMultiLangLabels {
  langName: string;
  dir: 'ltr' | 'rtl';
  activeNoticeTitle: string;
  middayBreakLabel: string;
  hydrateLabel: string;
  shadeLabel: string;
  workRestTitle: string;
  stopSignTitle: string;
  stopSignsList: string[];
  call998Label: string;
  noIndividualTrackingNote: string;
  shadeCheckInTitle: string;
  shadeCheckedInStatus: string;
  shadeTapCrewPrompt: string;
}

/**
 * Worker-facing safety labels supporting English, Arabic (RTL), Hindi, and Urdu.
 * Strictly crew/site-level operational guidance—zero personal medical data.
 */
export const WORKER_VIEW_LABELS: Record<WorkerLanguageCode, WorkerMultiLangLabels> = {
  en: {
    langName: 'English',
    dir: 'ltr',
    activeNoticeTitle: 'Crew Heat-Safety & Break Schedule',
    middayBreakLabel: 'UAE Midday Break (12:30–15:00): Zero open-sun outdoor work. Move to shaded/AC rest zone.',
    hydrateLabel: 'Drink 250 ml cool water every 15–20 minutes.',
    shadeLabel: 'Rest in designated shaded or air-conditioned shelters.',
    workRestTitle: 'Current Crew Work / Rest Cycles',
    stopSignTitle: 'Heat Illness Warning Signs — Stop Work Immediately',
    stopSignsList: [
      'Heavy sweating, sudden dizziness, confusion, hot dry skin, or fainting',
      'Stop work right away and move to a cool shaded or AC shelter',
      'Alert your site coordinator, contact site medic, or call UAE Ambulance 998',
    ],
    call998Label: 'UAE Emergency Ambulance: 998',
    noIndividualTrackingNote: 'Crew-level schedule only. No individual worker names or health data collected.',
    shadeCheckInTitle: 'Shady Area Quick Check-In (No Typing)',
    shadeCheckedInStatus: 'Checked into Shady Area',
    shadeTapCrewPrompt: 'Tap your crew code to log shade arrival instantly:',
  },
  ar: {
    langName: 'العربية',
    dir: 'rtl',
    activeNoticeTitle: 'جدول السلامة الحرارية وفترات الراحة للفرق',
    middayBreakLabel: 'حظر الظهيرة في الإمارات (12:30–15:00): يُمنع العمل تحت الشمس المباشرة. انتقل إلى منطقة راحة مظللة أو مكيفة.',
    hydrateLabel: 'اشرب 250 مل من الماء البارد كل 15 إلى 20 دقيقة.',
    shadeLabel: 'استرح في أماكن الظل أو التبريد المخصصة في الموقع.',
    workRestTitle: 'دورات العمل والراحة الحالية للفرق',
    stopSignTitle: 'علامات التحذير من الإجهاد الحراري — أوقف العمل فوراً',
    stopSignsList: [
      'التعرّق الشديد، الدوار أو الدوخة، التشوش، جفاف وسخونة الجلد، أو الإغماء',
      'توقف عن العمل فوراً وانتقل إلى مكان مظلل أو مكيّف',
      'أبلغ منسق الموقع وتواصل مع المسعف الميداني أو اتصل بالإسعاف 998',
    ],
    call998Label: 'إسعاف الإمارات للطوارئ: 998',
    noIndividualTrackingNote: 'جدول على مستوى الفريق فقط. لا يتم جمع أسماء العمال أو أي بيانات صحية فردية.',
    shadeCheckInTitle: 'تسجيل الدخول السريع لمنطقة الظل (دون كتابة)',
    shadeCheckedInStatus: 'تم تسجيل الدخول في منطقة الظل',
    shadeTapCrewPrompt: 'اضغط على رمز فريقك لتسجيل الوصول إلى الاستراحة فوراً:',
  },
  hi: {
    langName: 'हिन्दी (Hindi)',
    dir: 'ltr',
    activeNoticeTitle: 'टीम गर्मी सुरक्षा और आराम समय-सारिणी',
    middayBreakLabel: 'यूएई दोपहर ब्रेक (12:30–15:00): सीधी धूप में बाहर काम बंद। छायादार या ठंडी जगह पर आराम करें।',
    hydrateLabel: 'हर 15–20 मिनट में 250 मि.ली. ठंडा पानी पिएं।',
    shadeLabel: 'निर्धारित छायादार या एसी विश्राम क्षेत्र में रुकें।',
    workRestTitle: 'वर्तमान टीम कार्य और आराम चक्र',
    stopSignTitle: 'गर्मी से बीमारी के चेतावनी संकेत — तुरंत काम रोकें',
    stopSignsList: [
      'तेज पसीना, चक्कर आना, भ्रम, गर्म सूखी त्वचा, या बेहोशी',
      'तुरंत काम बंद करें और छायादार या ठंडी जगह पर जाएं',
      'साइट कोऑर्डिनेटर / साइट मेडिक को बताएं या यूएई एम्बुलेंस 998 पर कॉल करें',
    ],
    call998Label: 'यूएई आपातकालीन एम्बुलेंस: 998',
    noIndividualTrackingNote: 'केवल टीम-स्तरीय समय-सारिणी। कोई व्यक्तिगत नाम या स्वास्थ्य डेटा एकत्र नहीं किया जाता।',
    shadeCheckInTitle: 'छाया क्षेत्र त्वरित चेक-इन (बिना टाइप किए)',
    shadeCheckedInStatus: 'छाया क्षेत्र में चेक-इन हो गया',
    shadeTapCrewPrompt: 'तुरंत चेक-इन करने के लिए अपनी टीम कोड पर टैप करें:',
  },
  ur: {
    langName: 'اردو (Urdu)',
    dir: 'rtl',
    activeNoticeTitle: 'ٹیم گرمی سے بچاؤ اور آرام کا شیڈول',
    middayBreakLabel: 'متحدہ عرب امارات دوپہر کا وقفہ (12:30–15:00): براہ راست دھوپ میں کام بند۔ سایہ دار یا ٹھنڈی جگہ پر آرام کریں۔',
    hydrateLabel: 'ہر 15 سے 20 منٹ بعد 250 ملی لیٹر ٹھنڈا پانی پیئیں۔',
    shadeLabel: 'سائٹ پر مقررہ سایہ دار یا ایئر کنڈیشنڈ جگہ پر آرام کریں۔',
    workRestTitle: 'ٹیم کے کام اور آرام کا موجودہ شیڈول',
    stopSignTitle: 'گرمی کی بیماری کی علامات — فوراً کام روکیں',
    stopSignsList: [
      'بہت زیادہ پسینہ آنا، چکر آنا، الجھن، گرم خشک جلد، یا بے ہوشی',
      'فوری طور پر کام روکیں اور سایہ دار یا ٹھنڈی جگہ پر منتقل ہوں',
      'سائٹ کوآرڈینیٹر یا میڈک کو مطلع کریں یا ایمبولینس 998 پر کال کریں',
    ],
    call998Label: 'یو اے ای ایمرجنسی ایمبولینس: 998',
    noIndividualTrackingNote: 'صرف ٹیم کی سطح کا شیڈول۔ کسی کارکن کا ذاتی نام یا طبی معلومات جمع نہیں کی جاتیں۔',
    shadeCheckInTitle: 'سایہ دار جگہ فوری چیک ان (بغیر ٹائپنگ)',
    shadeCheckedInStatus: 'سایہ دار آرام گاہ میں چیک ان ہو گیا',
    shadeTapCrewPrompt: 'فوری چیک ان کے لیے اپنی ٹیم کا بٹن دبائیں:',
  },
};

export const DASHBOARD_COPY = {
  en: {
    brandName: 'HeatShield AI',
    brandSubtitle: 'UAE Site Coordinator Decision-Support',
    positioningLine:
      'Turns live heat conditions and anonymized shift rosters into compliant work-rest schedules without collecting individual worker health data.',
    disclaimerPersistent: 'Automated environmental guidance only. Not a medical diagnosis or treatment.',
    antiMisuseNotice: 'This tool must not be used for individual performance evaluation or disciplinary action.',
    aiGuidanceLabel: 'AI-generated guidance, coordinator must review.',
    validatedBadge: 'Validated by compliance engine',
    estimatedLabel: 'estimated',
    coordinatorMode: 'Site Coordinator',
    workerMode: 'Worker View',
    ourTeam: 'Our Team',
    voiceQa: 'Voice Safety Q&A',
    replanBtn: 'Re-plan Schedule',
    approveBtn: 'Approve Schedule',
    approvedBadge: 'Approved for Site Brief',
    loadDemoBtn: 'Load demo data',
    whatChangedTitle: 'What Changed vs. Previous Plan',
    privacyTitle: 'Privacy by Design',
    emergencyTitle: 'Emergency & First Aid Escalation',
  },
  ar: {
    brandName: 'درع الحرارة AI',
    brandSubtitle: 'أداة دعم القرار لمنسقي المواقع في الإمارات',
    positioningLine:
      'تحوّل الظروف الحرارية المباشرة وجداول الفرق المجهولة إلى جداول عمل وراحة متوافقة دون جمع بيانات صحية فردية.',
    disclaimerPersistent: 'إرشادات بيئية آلية فقط. ليست تشخيصاً طبياً ولا علاجاً.',
    antiMisuseNotice: 'يُمنع استخدام هذه الأداة لتقييم الأداء الفردي أو اتخاذ إجراءات تأديبية.',
    aiGuidanceLabel: 'إرشادات مولّدة بالذكاء الاصطناعي، يجب على المنسق مراجعتها.',
    validatedBadge: 'تم التحقق عبر محرك الامتثال',
    estimatedLabel: 'تقديري',
    coordinatorMode: 'منسق الموقع',
    workerMode: 'واجهة العامل',
    ourTeam: 'فريقنا',
    voiceQa: 'المساعد الصوتي',
    replanBtn: 'إعادة التخطيط',
    approveBtn: 'اعتماد الجدول',
    approvedBadge: 'معتمد للإحاطة الميدانية',
    loadDemoBtn: 'تحميل بيانات تجريبية',
    whatChangedTitle: 'ما الذي تغيّر مقارنة بالخطة السابقة',
    privacyTitle: 'الخصوصية بالتصميم',
    emergencyTitle: 'الطوارئ والإسعافات الأولية',
  },
} as const;
