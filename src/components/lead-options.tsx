"use client";

import { useI18n } from "@/components/i18n-provider";
import { FUNDING_VALUES, MEDICAL_VALUES, PROGRAM_VALUES, SOURCE_VALUES } from "@/lib/enums";

/** <option> lists for lead enums, labelled in the user's language. */
export function SourceOptions() {
  const { t } = useI18n();
  return SOURCE_VALUES.map((v) => <option key={v} value={v}>{t.source[v]}</option>);
}
export function ProgramOptions() {
  const { t } = useI18n();
  return PROGRAM_VALUES.map((v) => <option key={v} value={v}>{t.program[v]}</option>);
}
export function MedicalOptions() {
  const { t } = useI18n();
  return MEDICAL_VALUES.map((v) => <option key={v} value={v}>{t.medical[v]}</option>);
}
export function FundingOptions() {
  const { t } = useI18n();
  return FUNDING_VALUES.map((v) => <option key={v} value={v}>{t.funding[v]}</option>);
}
