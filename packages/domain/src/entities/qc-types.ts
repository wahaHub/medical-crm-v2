/**
 * Canonical QC payload types for the Unified AI Translation System.
 * These types define the stable shape of `questions` and `responses` fields
 * that are stored as `unknown` in QCTemplate and QCResponse entities.
 */

export type QCQuestionType = 'text' | 'textarea' | 'select' | 'multiselect' | 'checkbox' | 'date';

export interface QCTemplateQuestion {
  id: string;
  type: QCQuestionType;
  label: string;
  placeholder?: string;
  options?: string[];
  required?: boolean;
}

export type QCResponsePayload = Record<string, string | string[] | null>;
