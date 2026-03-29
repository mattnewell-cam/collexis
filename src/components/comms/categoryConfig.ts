import { CommCategory, ChaseSubtype, CommSender, ConversationSubtype } from '@/types/communication';

export interface CategoryDef {
  value: CommCategory;
  label: string;
  timelineLabelLines?: string[];
  timelineBadgeClass?: string;
  color: string; // tailwind bg class
  dotColor: string; // tailwind bg class for timeline dot
  subtypes?: { value: string; label: string }[];
}

const chaseSubtypes: { value: ChaseSubtype; label: string }[] = [
  { value: 'email', label: 'Email' },
  { value: 'text', label: 'Text' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'voicemail', label: 'Voicemail' },
  { value: 'home-visit', label: 'Home visit' },
];

const conversationSubtypes: { value: ConversationSubtype; label: string }[] = [
  { value: 'email', label: 'Email' },
  { value: 'text', label: 'Text' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'phone', label: 'Phone' },
  { value: 'in-person', label: 'In-person' },
];

export const CATEGORIES: CategoryDef[] = [
  { value: 'due-date', label: 'Due Date', color: 'bg-amber-100 text-amber-700', dotColor: 'bg-amber-400' },
  {
    value: 'collexis-handover',
    label: 'Collexis Handover',
    timelineLabelLines: ['Collexis', 'Handover'],
    timelineBadgeClass: 'min-w-[5.625rem]',
    color: 'bg-teal-100 text-teal-700',
    dotColor: 'bg-teal-400',
  },
  { value: 'chase', label: 'Chase', color: 'bg-red-100 text-red-700', dotColor: 'bg-red-400', subtypes: chaseSubtypes },
  { value: 'conversation', label: 'Conversation', color: 'bg-blue-100 text-blue-700', dotColor: 'bg-blue-400', subtypes: conversationSubtypes },
  { value: 'letter', label: 'Letter', color: 'bg-purple-100 text-purple-700', dotColor: 'bg-purple-400' },
  { value: 'other', label: 'Other', color: 'bg-gray-100 text-gray-600', dotColor: 'bg-gray-400' },
];

export function getCategoryDef(cat: CommCategory): CategoryDef {
  return CATEGORIES.find(c => c.value === cat)!;
}

export function getSubtypeLabel(subtype: string): string {
  const all = [...chaseSubtypes, ...conversationSubtypes];
  return all.find(s => s.value === subtype)?.label ?? subtype;
}

export function getDefaultSenderForCategory(category: CommCategory): CommSender {
  switch (category) {
    case 'collexis-handover':
      return 'collexis';
    default:
      return 'you';
  }
}

export function getSenderLabel(sender: CommSender): string {
  return sender === 'collexis' ? 'Collexis' : 'You';
}
