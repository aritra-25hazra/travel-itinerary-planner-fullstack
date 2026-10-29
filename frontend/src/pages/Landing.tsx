import { ArrowRight, BrainCircuit, FileDown, MapPinned, Share2, Sparkles, Users, Wallet, WandSparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, Card } from "../components/ui";
import { useAuth } from "../lib/auth";
import { useStore } from "../lib/store";

const FEATURES = [
  { icon: Sparkles, title: "Vibe-based destination picks", text: "No destination in mind? Tell us Beach / Mountains / Cultural / Urban and get the top 3 cities for your month and budget." },
  { icon: MapPinned, title: "Geographic clustering", text: "Each day stays in one neighbourhood. A route optimiser regroups nearby attractions so you never backtrack across the city." },
  { icon: Wallet, title: "Live budget tracker", text: "Every activity is costed in local currency, USD and INR, with a running total against your budget tier or hard cap." },
  { icon: WandSparkles, title: "Regenerate just one day", text: "\"Swap the museum for a market\", \"find a vegetarian lunch\" — only that day changes, the rest stays locked." },
  { icon: Users, title: "Built for groups", text: "Add each traveller's interests. The plan covers everyone and a group-fit report shows who's under-served, with timed schedules that flag late nights." },
  { icon: Share2, title: "Share & clone", text: "Send a read-only link to your group. Friends can view the plan, clone it into their own trips, tweak it and share back." },
  { icon: BrainCircuit, title: "Groq-powered, demo-safe", text: "Live generation with Groq LLMs when a key is configured; a deterministic demo engine otherwise, so the app always works." },
  { icon: FileDown, title: "Offline PDF guide", text: "One click exports the full plan with an emergency-contact checklist, packing list and local tips." },
];

export default function Landing() {
  const plan = useStore((s) => s.plan);
  const { enabled, session } = useAuth();
  return (
    <div className="space-y-10">
      <section className="rounded-3xl text-white p-8 sm:p-12 shadow-hero" style={{ backgroundImage: "linear-gradient(120deg,#0F5C5C 0%,#1D8A8A 55%,#FF8A70 100%)" }}>
        <p className="uppercase tracking-[.2em] text-xs opacity-80 mb-3">AI travel SaaS</p>
        <h1 className="font-display text-4xl sm:text-5xl leading-tight max-w-2xl">Day-by-day itineraries that respect your budget, your pace and your feet.</h1>
        <p className="mt-4 max-w-xl text-white/90">Tell us where (or just what vibe), when, who and how much. Get an optimised plan with clustered neighbourhoods, costed activities, a stay suggestion and transport between every stop.</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link to="/plan"><Button className="bg-white !text-teal hover:bg-sand">Plan my trip <ArrowRight className="w-4 h-4" /></Button></Link>
          {plan ? (
            <Link to="/itinerary"><Button variant="secondary" className="!bg-white/15 !border-white/40 !text-white hover:!bg-white/25">Open current itinerary</Button></Link>
          ) : (
            <Link to="/plan"><Button variant="secondary" className="!bg-white/15 !border-white/40 !text-white hover:!bg-white/25">Try without an account</Button></Link>
          )}
        </div>
        {enabled && !session && <p className="mt-4 text-xs text-white/80">Guest mode saves trips to this browser. <Link to="/login" className="underline">Sign in</Link> to keep them in your account.</p>}
      </section>

      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {FEATURES.map((f) => (
          <Card key={f.title} className="p-5">
            <f.icon className="w-6 h-6 text-coral" />
            <h3 className="font-semibold mt-3">{f.title}</h3>
            <p className="text-sm text-muted mt-1.5 leading-relaxed">{f.text}</p>
          </Card>
        ))}
      </section>

      <section className="grid md:grid-cols-4 gap-3 text-sm">
        {["1. Preferences", "2. Recommend or pick a city", "3. Generate & customise", "4. Save, export PDF"].map((s, i) => (
          <div key={s} className="rounded-2xl bg-sand p-4 font-medium text-ink flex items-center gap-3">
            <span className="w-7 h-7 rounded-full bg-teal text-white text-xs flex items-center justify-center">{i + 1}</span>
            {s.replace(/^\d\.\s/, "")}
          </div>
        ))}
      </section>
    </div>
  );
}
