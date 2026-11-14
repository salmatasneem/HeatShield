import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  ShieldAlert,
  Mail,
  ArrowLeft,
  ArrowRight,
  GraduationCap,
  Cpu,
  BrainCircuit,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import { AppLocale } from '../utils/i18n';
import { Footer } from './Footer';
import { DubaiSkyline } from './DubaiSkyline';

interface TeamPageProps {
  locale: AppLocale;
  onSetLocale: (locale: AppLocale) => void;
  onNavigateHome: () => void;
  onLaunchWorkspace: () => void;
  onOpenEvidence: () => void;
  onOpenImpact: () => void;
}

interface TeamMember {
  id: string;
  name: string;
  nameAr: string;
  initials: string;
  degree: string;
  degreeAr: string;
  department: string;
  departmentAr: string;
  email: string;
  linkedinUrl: string;
  linkedinLabel: string;
  theme: 'ece' | 'ai';
}

const TEAM_MEMBERS: TeamMember[] = [
  {
    id: 'salma',
    name: 'Salma Tasneem',
    nameAr: 'سلمى تسنيم',
    initials: 'ST',
    degree: 'Bachelor of Engineering (B.E.)',
    degreeAr: 'بكالوريوس في الهندسة (B.E.)',
    department: 'Electronics and Communication Engineering',
    departmentAr: 'هندسة الإلكترونيات والاتصالات',
    email: 'salmatasneem75@gmail.com',
    linkedinUrl: 'https://www.linkedin.com/in/salma-tasneem-884729310',
    linkedinLabel: 'linkedin.com/in/salma-tasneem-884729310',
    theme: 'ece',
  },
  {
    id: 'aasiya',
    name: 'Aasiya Hadiya',
    nameAr: 'آسية هادية',
    initials: 'AH',
    degree: 'Bachelor of Engineering (B.E.)',
    degreeAr: 'بكالوريوس في الهندسة (B.E.)',
    department: 'Artificial Intelligence and Data Science',
    departmentAr: 'الذكاء الاصطناعي وعلوم البيانات',
    email: 'aasiyahadiya7575@gmail.com',
    linkedinUrl: 'https://www.linkedin.com/in/aasiya-hadiya',
    linkedinLabel: 'linkedin.com/in/aasiya-hadiya',
    theme: 'ai',
  },
];

const LinkedInIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
  >
    <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77Z" />
  </svg>
);

export const TeamPage: React.FC<TeamPageProps> = ({
  locale,
  onSetLocale,
  onNavigateHome,
  onLaunchWorkspace,
  onOpenEvidence,
  onOpenImpact,
}) => {
  const isAr = locale === 'ar';
  const prefersReducedMotion = useReducedMotion();
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const handleCopyEmail = async (id: string, email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedId(id);
      setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 2000);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      lang={locale}
      className="min-h-screen bg-[#FAF8F3] text-[#173829] flex flex-col font-sans selection:bg-[#173829] selection:text-[#FAF8F3] overflow-x-hidden"
    >
      {/* Top Bar matching HeatShield Design System */}
      <header className="sticky top-0 z-40 bg-[#FAF8F3]/95 backdrop-blur-md border-b border-[#E8E2D5] shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onNavigateHome();
            }}
            className="flex items-center space-x-3 rtl:space-x-reverse whitespace-nowrap shrink-0"
          >
            <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-[#173829] text-white shadow-md shadow-[#173829]/20 border border-[#24533D]/40 shrink-0">
              <ShieldAlert className="w-5 h-5 text-[#FAF8F3]" />
            </div>
            <div className="flex items-baseline gap-x-2">
              <span className="font-arabic-calligraphy text-xl sm:text-2xl font-black text-[#173829] tracking-tight">
                دِرْعُ الحَرَارَةِ
              </span>
              <span className="text-[#557564] text-xs font-semibold font-sans tracking-wide">
                HeatShield
              </span>
            </div>
          </a>

          <nav
            aria-label="Team Page Navigation"
            className="hidden md:flex items-center gap-6 text-xs sm:text-sm font-bold text-[#2D4D3C]"
          >
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                onNavigateHome();
              }}
              className="hover:text-[#173829] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              {isAr ? 'الرئيسية' : 'Home'}
            </a>
            <a
              href="/team"
              onClick={(e) => e.preventDefault()}
              aria-current="page"
              className="text-[#173829] underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              {isAr ? 'فريقنا والتواصل' : 'Our Team'}
            </a>
            <button
              type="button"
              onClick={() => onSetLocale(locale === 'en' ? 'ar' : 'en')}
              className="hover:text-[#173829] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {locale === 'en' ? 'العربية' : 'English'}
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onSetLocale(locale === 'en' ? 'ar' : 'en')}
              className="md:hidden px-2.5 py-2 rounded-xl bg-[#EFE9DC] text-[#173829] text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
            >
              {locale === 'en' ? 'العربية' : 'EN'}
            </button>

            <button
              type="button"
              onClick={onNavigateHome}
              className="px-4 py-2.5 rounded-2xl bg-[#173829] hover:bg-[#24533D] text-[#FAF8F3] text-xs sm:text-sm font-bold transition-colors shadow-sm flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
              <span>{isAr ? 'العودة للرئيسية' : 'Back to Home'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Banner */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-6">
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 160, damping: 20 }}
            className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-[#EBF5F0] via-[#F4F9F6] to-[#FAF8F3] border border-[#DCEBE2] shadow-sm px-6 sm:px-10 pt-8 sm:pt-12 pb-6"
          >
            <div className="absolute top-0 right-0 w-80 h-80 bg-[#D8ECE1]/50 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-72 h-72 bg-[#FEF7DA]/50 rounded-full blur-2xl pointer-events-none" />

            <div className="relative z-10 max-w-3xl space-y-4">
              <div className="text-xs font-bold text-[#2D4D3C] flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>{isAr ? 'فريق درع الحرارة' : 'HeatShield Engineering & Research Team'}</span>
                <span aria-hidden="true">·</span>
                <span>{isAr ? 'تواصل معنا' : 'Contact & Collaboration'}</span>
              </div>

              <h1 className="text-3xl sm:text-5xl font-black text-[#173829] tracking-tight leading-tight text-balance">
                {isAr ? 'تعرّف على العقول خلف درع الحرارة' : 'Meet the Minds Behind HeatShield'}
              </h1>

              <p className="text-base sm:text-lg text-[#385947] leading-relaxed font-medium max-w-2xl">
                {isAr
                  ? 'صُمم بالابتكار والتعاون وبرؤية واضحة لابتكار حلول تقنية أكثر ذكاءً.'
                  : 'Built with innovation, collaboration and a vision to create smarter solutions.'}
              </p>
            </div>

            <div className="relative z-10 mt-6 pt-4 border-t border-[#D5E5DC]/70 opacity-85">
              <DubaiSkyline fillColor="#173829" accentColor="#2D5E46" height={54} />
            </div>
          </motion.div>
        </section>

        {/* Equal-Height Side-by-Side Team Profile Cards */}
        <section
          aria-label="Team Members"
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 items-stretch">
            {TEAM_MEMBERS.map((member, index) => {
              const isEce = member.theme === 'ece';
              const isCopied = copiedId === member.id;

              return (
                <motion.article
                  key={member.id}
                  initial={
                    prefersReducedMotion
                      ? false
                      : {
                          opacity: 0,
                          x: index === 0 ? (isAr ? 45 : -45) : isAr ? -45 : 45,
                          y: 24,
                          scale: 0.96,
                        }
                  }
                  animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                  whileHover={prefersReducedMotion ? undefined : { y: -6 }}
                  transition={{
                    type: 'spring',
                    stiffness: 170,
                    damping: 20,
                    delay: index * 0.1,
                  }}
                  className="bg-white border border-[#E5DFD3] rounded-3xl p-6 sm:p-8 shadow-sm hover:shadow-xl hover:border-[#C5DFD0] transition-all flex flex-col justify-between h-full will-change-transform"
                >
                  {/* Upper Card Content */}
                  <div className="space-y-6">
                    {/* Profile Avatar Placeholder + Identity */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                      {/* Swap-ready Profile Avatar Frame (replace inner content with <img> later) */}
                      <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-3xl overflow-hidden shrink-0 border-2 border-[#C5DFD0] shadow-md bg-gradient-to-br from-[#173829] via-[#24533D] to-[#173829] flex items-center justify-center group">
                        {/* Subtle Tech Pattern Background */}
                        <svg
                          viewBox="0 0 100 100"
                          aria-hidden="true"
                          className="absolute inset-0 w-full h-full opacity-20"
                        >
                          {isEce ? (
                            <g stroke="#A3E5C1" strokeWidth="1.5" fill="none">
                              <path d="M10 25 H35 L45 35 H85" />
                              <path d="M15 72 H45 L58 58 H90" />
                              <circle cx="35" cy="25" r="2.5" fill="#A3E5C1" />
                              <circle cx="58" cy="58" r="2.5" fill="#A3E5C1" />
                            </g>
                          ) : (
                            <g stroke="#A3E5C1" strokeWidth="1.4" fill="none">
                              <circle cx="24" cy="28" r="3" fill="#A3E5C1" />
                              <circle cx="76" cy="24" r="3" fill="#A3E5C1" />
                              <circle cx="50" cy="50" r="3.5" fill="#A3E5C1" />
                              <circle cx="28" cy="76" r="3" fill="#A3E5C1" />
                              <circle cx="74" cy="74" r="3" fill="#A3E5C1" />
                              <line x1="24" y1="28" x2="50" y2="50" />
                              <line x1="76" y1="24" x2="50" y2="50" />
                              <line x1="28" y1="76" x2="50" y2="50" />
                              <line x1="74" y1="74" x2="50" y2="50" />
                            </g>
                          )}
                        </svg>

                        {/* Stylized Initials Placeholder */}
                        <div className="relative z-10 flex flex-col items-center justify-center text-[#FAF8F3]">
                          <span className="text-2xl sm:text-3xl font-black tracking-tight font-sans">
                            {member.initials}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1 min-w-0">
                        <h2 className="text-2xl sm:text-3xl font-black text-[#173829] tracking-tight">
                          {isAr ? member.nameAr : member.name}
                        </h2>
                      </div>
                    </div>

                    {/* Academic Credentials */}
                    <div className="rounded-2xl bg-[#FAF8F3] border border-[#E5DFD3] p-4 sm:p-5 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-xl bg-[#EBF5F0] text-[#173829] shrink-0 mt-0.5">
                          <GraduationCap className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-[#557564]">
                            {isAr ? 'الدرجة العلمية' : 'Degree'}
                          </div>
                          <div className="text-sm font-bold text-[#173829] mt-0.5">
                            {isAr ? member.degreeAr : member.degree}
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-[#E8E2D5]" />

                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-xl bg-[#EBF5F0] text-[#173829] shrink-0 mt-0.5">
                          {isEce ? (
                            <Cpu className="w-4 h-4" />
                          ) : (
                            <BrainCircuit className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-[#557564]">
                            {isAr ? 'القسم العلمي' : 'Department'}
                          </div>
                          <div className="text-sm font-bold text-[#173829] mt-0.5">
                            {isAr ? member.departmentAr : member.department}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Contact Details & Action Links */}
                  <div className="mt-6 pt-5 border-t border-[#ECE6DA] space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-bold text-[#557564]">
                          {isAr ? 'البريد الإلكتروني:' : 'Email'}
                        </span>
                        <div className="flex items-center gap-2 min-w-0">
                          <a
                            href={`mailto:${member.email}`}
                            className="font-mono font-semibold text-[#173829] underline underline-offset-2 hover:text-[#24533D] flex items-center gap-1.5 truncate"
                          >
                            <Mail className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{member.email}</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => handleCopyEmail(member.id, member.email)}
                            aria-label={`Copy ${member.name} email`}
                            title={isAr ? 'نسخ البريد الإلكتروني' : 'Copy email address'}
                            className="p-1.5 rounded-lg bg-[#FAF8F3] hover:bg-[#EBF5F0] border border-[#E5DFD3] text-[#2D4D3C] transition-colors cursor-pointer shrink-0"
                          >
                            {isCopied ? (
                              <Check className="w-3.5 h-3.5 text-[#15803D]" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-bold text-[#557564]">
                          {isAr ? 'لينكدإن:' : 'LinkedIn'}
                        </span>
                        <a
                          href={member.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono font-semibold text-[#173829] underline underline-offset-2 hover:text-[#24533D] truncate"
                        >
                          {member.linkedinLabel}
                        </a>
                      </div>
                    </div>

                    {/* Prominent Clickable Email & LinkedIn Icon Actions */}
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <a
                        href={`mailto:${member.email}`}
                        aria-label={`Email ${member.name}`}
                        className="py-3 px-4 rounded-2xl bg-[#173829] hover:bg-[#24533D] text-[#FAF8F3] font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99] whitespace-nowrap"
                      >
                        <Mail className="w-4 h-4 shrink-0" />
                        <span>{isAr ? 'مراسلة عبر البريد' : 'Email'}</span>
                      </a>

                      <a
                        href={member.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${member.name} LinkedIn Profile`}
                        className="py-3 px-4 rounded-2xl bg-[#EBF5F0] hover:bg-[#D5E5DC] text-[#173829] border border-[#C5DFD0] font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99] whitespace-nowrap"
                      >
                        <LinkedInIcon className="w-4 h-4 shrink-0 text-[#173829]" />
                        <span>{isAr ? 'ملف LinkedIn' : 'LinkedIn'}</span>
                        <ExternalLink className="w-3.5 h-3.5 opacity-75 shrink-0" />
                      </a>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </div>
        </section>

        {/* Bottom Vision Statement & Back to Homepage Section */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-10">
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 24, scale: 0.97 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ type: 'spring', stiffness: 160, damping: 20 }}
            className="rounded-3xl bg-[#173829] text-[#FAF8F3] p-8 sm:p-12 shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6"
          >
            <div className="space-y-2.5 max-w-2xl">
              <div className="font-arabic-calligraphy text-xl sm:text-2xl text-[#A3E5C1]">
                دِرْعُ الحَرَارَةِ · HeatShield
              </div>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-balance">
                {isAr
                  ? 'عقلان. رؤية واحدة. ابتكار أذكى مع درع الحرارة.'
                  : 'Two minds. One vision. Smarter innovation with HeatShield.'}
              </h2>
              <p className="text-xs sm:text-sm text-[#D7E6DD] leading-relaxed">
                {isAr
                  ? 'نجمع بين هندسة الإلكترونيات والاتصالات والذكاء الاصطناعي وعلوم البيانات لبناء حلول عملية تحمي العاملين في الميدان.'
                  : 'Combining Electronics & Communication Engineering with Artificial Intelligence & Data Science to build practical, protective field technology.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={onNavigateHome}
                className="px-6 py-3.5 rounded-2xl bg-[#FAF8F3] hover:bg-white text-[#173829] font-black text-xs sm:text-sm flex items-center gap-2 shadow-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
                <span>{isAr ? 'العودة إلى صفحة درع الحرارة الرئيسية' : 'Back to HeatShield Homepage'}</span>
              </button>

              <button
                type="button"
                onClick={onLaunchWorkspace}
                className="px-5 py-3.5 rounded-2xl bg-[#24533D] hover:bg-[#2E664C] text-[#FAF8F3] border border-[#3B7C5D] font-bold text-xs sm:text-sm flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>{isAr ? 'دخول المنظومة' : 'Open Workspace'}</span>
                <ArrowRight className="w-4 h-4 rtl:rotate-180" />
              </button>
            </div>
          </motion.div>
        </section>
      </main>

      <Footer
        onOpenEvidence={onOpenEvidence}
        onOpenImpact={onOpenImpact}
        onOpenTeam={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        locale={locale}
      />
    </div>
  );
};
