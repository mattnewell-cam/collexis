import AuthGate from '@/components/auth/AuthGate';
import OnboardingForm from '@/components/auth/OnboardingForm';

export default function OnboardingPage() {
  return (
    <AuthGate mode="onboarding">
      <OnboardingForm />
    </AuthGate>
  );
}
