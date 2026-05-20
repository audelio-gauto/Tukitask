import { redirect } from 'next/navigation';

export default function TukiBotResultadosRedirectPage() {
  redirect('/vendedor/tukibot?tab=results');
}
