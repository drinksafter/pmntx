import { requireUser } from "@/lib/auth/session";
import { NavShell } from "@/components/nav-shell";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  return <NavShell user={user}>{children}</NavShell>;
}
