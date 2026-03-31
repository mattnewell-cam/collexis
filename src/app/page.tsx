import AuthGate from '@/components/auth/AuthGate';
import AuthLanding from '@/components/auth/AuthLanding';

export default function Home() {
  return (
    <AuthGate mode="public">
      <AuthLanding />
    </AuthGate>
  );
}
