import { Footer, Formats, Games, Hero, How } from '../src/components/landing/Landing';

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <Hero />
      <Formats />
      <Games />
      <How />
      <Footer />
    </main>
  );
}
