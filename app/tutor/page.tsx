import { redirect } from 'next/navigation';

// The tutor dashboard moved into the 3-step Game Studio.
export default function TutorPage() {
    redirect('/tutor/create');
}
