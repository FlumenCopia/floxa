"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const firstFrameFields = [
  {
    key: "what",
    label: "What do you do?",
    placeholder: "Describe your product or service in 2-3 sentences...",
  },
  {
    key: "customer",
    label: "Who is your target customer?",
    placeholder: "Demographics, mindset, and what they care about...",
  },
  {
    key: "choose",
    label: "Why should they choose you?",
    placeholder: "Your key differentiator from competitors...",
  },
  {
    key: "trust",
    label: "Why should they trust you?",
    placeholder: "Years of experience, certifications, key results...",
  },
];

const personalityOne = [
  ["Playful", "Serious"],
  ["Friendly", "Premium"],
  ["Bold", "Minimal"],
  ["Classic", "Modern"],
  ["Affordable", "Expensive"],
  ["Mass", "Niche"],
];

const personalityTwo = [
  ["Formal", "Casual"],
  ["Individual", "Corporate"],
  ["Traditional", "Innovative"],
  ["Local", "Global"],
  ["Feminine", "Masculine"],
  ["Intellectual", "Emotional"],
  ["Fast", "Deliberate"],
];

const emotions = [
  "Bold",
  "Trustworthy",
  "Creative",
  "Modern",
  "Confident",
  "Warm",
  "Innovative",
  "Premium",
  "Playful",
  "Reliable",
  "Aspirational",
  "Authentic",
  "Empowering",
  "Energetic",
  "Elegant",
  "Inspiring",
];

const audienceOptions = [
  ["cart", "Value Seeker", "Price-conscious, practical"],
  ["gem", "Premium Seeker", "Quality over price"],
  ["globe", "Experience Hunter", "Seeks novelty & experiences"],
  ["spark", "Status Driven", "Brand prestige matters"],
  ["sprout", "Purpose Buyer", "Values-aligned purchases"],
  ["building", "Trend Follower", "Early adopter, social-proof"],
];

const logoOptions = [
  ["BRAND", "Modern Sans", "logo-modern"],
  ["Brand", "Serif Classic", "logo-serif"],
  ["<>", "Minimal Mark", "logo-mark"],
  ["|||", "Geometric", "logo-geo"],
  ["Brand", "Script Flow", "logo-script"],
  ["B R A N D", "All Caps", "logo-caps"],
];

const visualOptions = [
  ["Bold & Graphic", "High contrast, geometric, commanding"],
  ["Clean & Minimal", "White space, typography-led, precise"],
  ["Warm & Organic", "Natural textures, earthy, approachable"],
  ["Dark & Premium", "Deep backgrounds, gold accents, luxe"],
  ["Bright & Energetic", "Saturated colours, dynamic layouts"],
  ["Muted & Refined", "Soft palette, considered, understated"],
];

const defaultAnswers = {
  what: "",
  customer: "",
  choose: "",
  trust: "",
  feeling: "",
};

const choiceIconLabels = {
  cart: "$",
  gem: "D",
  globe: "O",
  spark: "*",
  sprout: "^",
  building: "#",
};


const makeSliderState = (pairs) =>
  pairs.reduce((acc, pair) => ({ ...acc, [pair.join("-")]: 0 }), {});

function StepDots({ active, total = 9 }) {
  return (
    <div className="cp-dots" aria-label={`Step ${active} of ${total}`}>
      {Array.from({ length: total }, (_, index) => (
        <span className={index + 1 === active ? "active" : ""} key={index} />
      ))}
    </div>
  );
}

function PortalHeader({ onClose }) {
  return (
    <header className="cp-header">
      <div className="cp-logo">FLOXA</div>
      <button className="cp-close" onClick={onClose} type="button">
        X Close
      </button>
    </header>
  );
}

function PortalCard({ step, title, subtitle, children, onBack, onNext, submit }) {
  return (
    <section className="cp-card">
      <div className="cp-card-top">
        <span>Discovery</span>
        <StepDots active={step} />
      </div>
      <div className="cp-step-copy">
        <div className="cp-frame">Frame {step} of 9</div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      <div className="cp-card-body">{children}</div>
      <footer className="cp-card-footer">
        <button className="cp-back" type="button" onClick={onBack}>
          {"<- Back"}
        </button>
        <StepDots active={step} />
        <button className="cp-primary cp-footer-btn" type="button" onClick={onNext}>
          {submit ? "Submit Discovery ->" : "Continue ->"}
        </button>
      </footer>
    </section>
  );
}

function SliderRows({ pairs, values, setValues }) {
  return (
    <div className="cp-slider-list">
      {pairs.map(([left, right]) => {
        const key = `${left}-${right}`;
        return (
          <label className="cp-slider-row" key={key}>
            <span>{left}</span>
            <input
              aria-label={`${left} to ${right}`}
              max="100"
              min="-100"
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  [key]: Number(event.target.value),
                }))
              }
              step="1"
              type="range"
              value={values[key]}
            />
            <span>{right}</span>
            <strong>{values[key]}</strong>
          </label>
        );
      })}
    </div>
  );
}

function ChoiceGrid({ items, selected, setSelected, limit = 1, className = "" }) {
  function toggle(value) {
    setSelected((current) => {
      if (current.includes(value)) {
        return current.filter((item) => item !== value);
      }
      if (limit === 1) {
        return [value];
      }
      return current.length >= limit ? current : [...current, value];
    });
  }

  return (
    <div className={`cp-choice-grid ${className}`.trim()}>
      {items.map((item) => {
        const [icon, title, copy] = item.length === 3 ? item : ["", item[0], item[1]];
        const isSelected = selected.includes(title);
        return (
          <button
            className={`cp-choice ${isSelected ? "selected" : ""}`.trim()}
            key={title}
            onClick={() => toggle(title)}
            type="button"
          >
            {icon ? (
              <span className={`cp-choice-icon ${icon}`.trim()}>
                {choiceIconLabels[icon] || icon}
              </span>
            ) : null}
            <strong>{title}</strong>
            {copy ? <small>{copy}</small> : null}
          </button>
        );
      })}
    </div>
  );
}

export default function Clientportal() {
  const router = useRouter();
  const [entered, setEntered] = useState(false);
  const [finished, setFinished] = useState(false);
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("akhilss235@gmail.com");
  const [answers, setAnswers] = useState(defaultAnswers);
  const [sliderOne, setSliderOne] = useState(() => makeSliderState(personalityOne));
  const [sliderTwo, setSliderTwo] = useState(() => makeSliderState(personalityTwo));
  const [selectedEmotions, setSelectedEmotions] = useState(["Aspirational"]);
  const [selectedAudience, setSelectedAudience] = useState(["Trend Follower"]);
  const [selectedLogo, setSelectedLogo] = useState([]);
  const [competitorInput, setCompetitorInput] = useState("");
  const [competitors, setCompetitors] = useState([]);
  const [selectedVisual, setSelectedVisual] = useState([]);

  const canStart = email.trim().includes("@");
  const resultLine = useMemo(() => {
    if (selectedEmotions.includes("Bold")) return "Built to feel confident, sharp, and memorable.";
    if (selectedVisual.includes("Warm & Organic")) return "Designed to feel thoughtful, human, and grounded.";
    return "We believe in doing everything well.";
  }, [selectedEmotions, selectedVisual]);

  function updateAnswer(key, value) {
    setAnswers((current) => ({ ...current, [key]: value }));
  }

  function goNext() {
    if (step === 9) {
      setFinished(true);
      return;
    }
    setStep((current) => Math.min(current + 1, 9));
  }

  function goBack() {
    setStep((current) => Math.max(current - 1, 1));
  }

  function addCompetitor() {
    const nextCompetitor = competitorInput.trim();
    if (!nextCompetitor) return;
    setCompetitors((current) =>
      current.includes(nextCompetitor) ? current : [...current, nextCompetitor]
    );
    setCompetitorInput("");
  }

  if (finished) {
    return (
      <main className="cp-screen">
        <PortalHeader onClose={() => router.push("/")} />
        <section className="cp-result-card">
          <div className="cp-frame">Your brand personality</div>
          <h1>Balanced</h1>
          <div className="cp-archetype">* The Harmonist Archetype</div>
          <p>{resultLine}</p>
          <div className="cp-result-grid">
            <div>
              <span>Tone</span>
              <strong>Balanced & Thoughtful</strong>
            </div>
            <div>
              <span>Brand Promise</span>
              <strong>{resultLine}</strong>
            </div>
            <div>
              <span>Tagline</span>
              <strong>Crafted with intention</strong>
            </div>
          </div>
          <p className="cp-result-note">
            Your consultant has been notified. Expect your full brand brief within 48 hours.
          </p>
        </section>
      </main>
    );
  }

  if (!entered) {
    return (
      <main className="cp-screen">
        <PortalHeader onClose={() => router.push("/")} />
        <section className="cp-entry-card">
          <div className="cp-orb" aria-hidden="true" />
          <h1>{"Let's discover your brand."}</h1>
          <p>
            {"You've"} been invited to complete a 12-minute brand discovery session. Your answers
            help craft your unique brand identity.
          </p>
          <label className="cp-field">
            <span>Your email address</span>
            <input
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
          </label>
          <button
            className="cp-primary cp-enter"
            disabled={!canStart}
            onClick={() => setEntered(true)}
            type="button"
          >
            {"Enter portal ->"}
          </button>
          <small>Answers are shared only with your consultant and kept securely encrypted.</small>
        </section>
      </main>
    );
  }

  return (
    <main className="cp-screen">
      <PortalHeader onClose={() => router.push("/")} />

      {step === 1 ? (
        <PortalCard
          onBack={goBack}
          onNext={goNext}
          step={step}
          subtitle="Help us understand what makes you unique"
          title="Tell us about your brand"
        >
          <div className="cp-textarea-stack">
            {firstFrameFields.map((field) => (
              <label className="cp-field" key={field.key}>
                <span>{field.label}</span>
                <textarea
                  onChange={(event) => updateAnswer(field.key, event.target.value)}
                  placeholder={field.placeholder}
                  value={answers[field.key]}
                />
              </label>
            ))}
          </div>
        </PortalCard>
      ) : null}

      {step === 2 ? (
        <PortalCard
          onBack={goBack}
          onNext={goNext}
          step={step}
          subtitle="Drag each slider to position your brand on the spectrum"
          title="Brand personality"
        >
          <SliderRows pairs={personalityOne} setValues={setSliderOne} values={sliderOne} />
        </PortalCard>
      ) : null}

      {step === 3 ? (
        <PortalCard
          onBack={goBack}
          onNext={goNext}
          step={step}
          subtitle="Keep positioning your brand across these dimensions"
          title="Brand personality (continued)"
        >
          <SliderRows pairs={personalityTwo} setValues={setSliderTwo} values={sliderTwo} />
        </PortalCard>
      ) : null}

      {step === 4 ? (
        <PortalCard
          onBack={goBack}
          onNext={goNext}
          step={step}
          subtitle="Select up to 5 emotions you want your brand to evoke in people"
          title="Brand emotions"
        >
          <ChoiceGrid
            className="cp-emotion-grid"
            items={emotions.map((emotion) => [emotion, ""])}
            limit={5}
            selected={selectedEmotions}
            setSelected={setSelectedEmotions}
          />
        </PortalCard>
      ) : null}

      {step === 5 ? (
        <PortalCard
          onBack={goBack}
          onNext={goNext}
          step={step}
          subtitle="Which archetype best describes your ideal customer?"
          title="Your audience"
        >
          <ChoiceGrid
            className="cp-audience-grid"
            items={audienceOptions}
            selected={selectedAudience}
            setSelected={setSelectedAudience}
          />
        </PortalCard>
      ) : null}

      {step === 6 ? (
        <PortalCard
          onBack={goBack}
          onNext={goNext}
          step={step}
          subtitle="Select up to 2 directions that feel right for your brand"
          title="Logo style preference"
        >
          <div className="cp-logo-grid">
            {logoOptions.map(([mark, title, className]) => {
              const isSelected = selectedLogo.includes(title);
              return (
                <button
                  className={`cp-logo-option ${isSelected ? "selected" : ""}`.trim()}
                  key={title}
                  onClick={() =>
                    setSelectedLogo((current) => {
                      if (current.includes(title)) return current.filter((item) => item !== title);
                      return current.length >= 2 ? current : [...current, title];
                    })
                  }
                  type="button"
                >
                  <strong className={className}>{mark}</strong>
                  <span>{title}</span>
                </button>
              );
            })}
          </div>
        </PortalCard>
      ) : null}

      {step === 7 ? (
        <PortalCard
          onBack={goBack}
          onNext={goNext}
          step={step}
          subtitle="Add brands you compete with - tell us how you feel about them"
          title="Competitor landscape"
        >
          <div className="cp-competitor-row">
            <input
              onChange={(event) => setCompetitorInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") addCompetitor();
              }}
              placeholder="Enter a brand name..."
              value={competitorInput}
            />
            <button className="cp-primary" onClick={addCompetitor} type="button">
              Add
            </button>
          </div>
          <div className="cp-competitor-list">
            {competitors.length ? (
              competitors.map((competitor) => <span key={competitor}>{competitor}</span>)
            ) : (
              <p>No competitors added yet. Add at least one brand you admire or compete with.</p>
            )}
          </div>
        </PortalCard>
      ) : null}

      {step === 8 ? (
        <PortalCard
          onBack={goBack}
          onNext={goNext}
          step={step}
          subtitle="Choose a visual world that resonates most with your brand"
          title="Visual direction"
        >
          <ChoiceGrid
            className="cp-visual-grid"
            items={visualOptions}
            selected={selectedVisual}
            setSelected={setSelectedVisual}
          />
        </PortalCard>
      ) : null}

      {step === 9 ? (
        <PortalCard
          onBack={goBack}
          onNext={goNext}
          step={step}
          submit
          subtitle="In your own words - what should people feel when they experience your brand?"
          title="Brand feeling"
        >
          <label className="cp-field">
            <span>Describe the feeling</span>
            <textarea
              className="cp-feeling"
              onChange={(event) => updateAnswer("feeling", event.target.value)}
              placeholder="I want people to feel..."
              value={answers.feeling}
            />
          </label>
          <div className="cp-almost">
            <strong>* Almost done!</strong>
            <p>
              Your consultant will be notified when you submit. {"They'll"} begin crafting your Brand
              DNA immediately.
            </p>
          </div>
        </PortalCard>
      ) : null}
    </main>
  );
}
