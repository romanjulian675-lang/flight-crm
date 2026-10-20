import { I18nProvider } from "@/components/i18n-provider";
import { getI18n } from "@/lib/i18n";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const { t, locale } = await getI18n();
  return <I18nProvider value={{ t, locale, timeZone: "UTC" }}>{children}</I18nProvider>;
}
