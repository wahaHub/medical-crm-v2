import { redirect } from 'next/navigation';

// The standalone Lifecycle section was merged into Cases as the board view.
export default function LifecyclePage() {
  redirect('/cases?view=board');
}
