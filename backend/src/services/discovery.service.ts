export function calculateCluster(sliders: any[] = []): string {
  if (!sliders || sliders.length === 0) return 'Bold Challenger';

  const scores = sliders.map((s: any) => {
    const score = ((s.value || 50) / 100) * 6 - 3;
    return { score, distance: Math.abs(score) };
  });
  const avg = scores.reduce((sum: number, item: any) => sum + item.score, 0) / scores.length;

  if (avg < -1.5) return 'Soft Minimalist';
  if (avg < -0.4) return 'Quiet Specialist';
  if (avg < 0.8) return 'Balanced Clarity';
  if (avg < 2.1) return 'Bold Challenger';
  return 'Electric Leader';
}

function getClusterPalette(cluster: string): Array<{ role: string; name: string; hex: string; usage: string }> {
  switch (cluster) {
    case 'Electric Leader':
      return [
        { role: 'Dominant (60%)', name: 'Deep Void Obsidian', hex: '#060e0a', usage: 'Deep background canvas and negative space' },
        { role: 'Secondary (30%)', name: 'Emerald Slate', hex: '#132a1e', usage: 'Structural containers, cards, and secondary layers' },
        { role: 'Accent (10%)', name: 'Neon Hypergreen', hex: '#4dffa0', usage: 'Arresting focal points, critical headlines, and key CTAs' },
        { role: 'Canvas Contrast', name: 'Pure Mint Mist', hex: '#e8fff3', usage: 'Crisp text contrast and luminous highlights' },
      ];
    case 'Soft Minimalist':
      return [
        { role: 'Dominant (60%)', name: 'Warm Alabaster', hex: '#f7f5f0', usage: 'Bright airy background and generous whitespace' },
        { role: 'Secondary (30%)', name: 'Muted Mineral Sage', hex: '#89aca0', usage: 'Soft geometric shapes and card borders' },
        { role: 'Accent (10%)', name: 'Forest Deep', hex: '#0a1912', usage: 'High-contrast typography and focal elements' },
        { role: 'Canvas Contrast', name: 'Soft Linen', hex: '#ffffff', usage: 'Card surfaces and interior framing' },
      ];
    case 'Quiet Specialist':
      return [
        { role: 'Dominant (60%)', name: 'Deep Navy Charcoal', hex: '#0b1320', usage: 'Authoritative dark canvas and primary backdrop' },
        { role: 'Secondary (30%)', name: 'Slate Quartz', hex: '#1e293b', usage: 'Card structures, dividers, and framing elements' },
        { role: 'Accent (10%)', name: 'Precision Cyan', hex: '#38bdf8', usage: 'Data callouts, key metrics, and decisive CTAs' },
        { role: 'Canvas Contrast', name: 'Frost Platinum', hex: '#f1f5f9', usage: 'Primary typography and high-clarity labels' },
      ];
    case 'Balanced Clarity':
      return [
        { role: 'Dominant (60%)', name: 'Emerald Obsidian', hex: '#0a1912', usage: 'Signature dark emerald canvas' },
        { role: 'Secondary (30%)', name: 'Mineral Forest', hex: '#163325', usage: 'Panel backdrops and layered depth' },
        { role: 'Accent (10%)', name: 'Vibrant Mint', hex: '#34d399', usage: 'Interactive accents, badges, and focal hooks' },
        { role: 'Canvas Contrast', name: 'Clean Snow', hex: '#f0fdf4', usage: 'Headline typography and luminous borders' },
      ];
    case 'Bold Challenger':
    default:
      return [
        { role: 'Dominant (60%)', name: 'Carbon Black', hex: '#0a0d12', usage: 'High-impact dark background' },
        { role: 'Secondary (30%)', name: 'Deep Forest Green', hex: '#0f291e', usage: 'Layered panels and textured surfaces' },
        { role: 'Accent (10%)', name: 'Neon Kinetic Emerald', hex: '#4dffa0', usage: 'Arresting visual hooks, punchy badges, and action triggers' },
        { role: 'Canvas Contrast', name: 'Ghost White', hex: '#f8fafc', usage: 'High-visibility headline typography' },
      ];
  }
}

function getClusterTypography(cluster: string) {
  switch (cluster) {
    case 'Soft Minimalist':
      return {
        headlineStyle: 'High-contrast editorial serif in Title Case with generous line height',
        bodyStyle: 'Clean humanist sans-serif in regular weight with loose tracking',
        pairingRationale: 'Reflects understated luxury, organic craftsmanship, and quiet confidence.',
      };
    case 'Quiet Specialist':
      return {
        headlineStyle: 'Structured technical sans-serif in medium/semibold weight',
        bodyStyle: 'Crisp geometric monospace or neutral sans-serif',
        pairingRationale: 'Communicates engineering rigor, intellectual authority, and meticulous precision.',
      };
    case 'Electric Leader':
      return {
        headlineStyle: 'Ultra-bold progressive display sans-serif in tight uppercase',
        bodyStyle: 'Modern geometric sans-serif in medium weight',
        pairingRationale: 'Creates arresting kinetic energy, visionary ambition, and instant stopping power.',
      };
    case 'Balanced Clarity':
    case 'Bold Challenger':
    default:
      return {
        headlineStyle: 'Heavy geometric grotesque sans-serif in tight tracking and impactful case',
        bodyStyle: 'Clean modern sans-serif in crisp regular/medium weight',
        pairingRationale: 'Commands immediate attention while maintaining effortless readability across all formats.',
      };
  }
}

export function buildBrandDNAData(project: any, discovery: any) {
  const profile = project.clientProfile;
  const companyName = profile?.companyName || project.companyName || project.title || 'The Brand';
  const industry = profile?.industry || project.sector || 'Creative Industry';

  const whatBusinessDoes = discovery.whatBusinessDoes || discovery.what_business_does || 'A distinctive client offering.';
  const targetCustomer = discovery.targetCustomer || discovery.target_customer || 'discerning clients seeking excellence';
  const whyChooseUs = discovery.whyChooseUs || discovery.why_choose_us || 'unique craftsmanship and decisive execution';
  const brandFeeling = discovery.brandFeeling || discovery.brand_feeling || 'confident, modern, and memorable';

  const rawEmotions = discovery.emotions || [];
  const emotionsList = rawEmotions.map((e: any) => (typeof e === 'string' ? e : e?.emotion)).filter(Boolean);
  const emotions = emotionsList.join(', ') || 'trust, bold, refined';

  const rawStyles = discovery.visualStyles || discovery.visual_styles || [];
  const stylesList = rawStyles.map((s: any) => (typeof s === 'string' ? s : s?.style)).filter(Boolean);
  const visualStyles = stylesList.join(', ') || 'Bold & Loud, Minimal & Clean';

  const rawComps = discovery.competitors || [];
  const competitors = rawComps
    .slice(0, 5)
    .map((c: any) => `${c.name || 'Competitor'} (${c.rating || 'neutral'})`)
    .join(', ') || 'No direct competitor benchmarks submitted.';

  const cluster = calculateCluster(discovery.sliders);
  const palette = getClusterPalette(cluster);
  const typography = getClusterTypography(cluster);

  const posterConcepts = [
    {
      angle: 'Concept 1: Primary Hero Theme',
      conceptName: `${cluster} Statement`,
      description: `A bold, iconic showcase of ${companyName}'s core value proposition. Focuses on decisive visual hierarchy and immediate recognition.`,
      visualHook: `Arresting high-contrast central subject bathed in ${palette[2].name} neon rim lighting over a ${palette[0].name} backdrop.`,
    },
    {
      angle: 'Concept 2: Typographic & Narrative Theme',
      conceptName: 'The Definitive Shift',
      description: `Puts the brand's key promise ("${whyChooseUs}") front and center through bold, tight-tracked typographic storytelling.`,
      visualHook: `Massive scale-shifted headline text occupying 50% of the canvas with subtle dimensional shadows and a sharp contrast callout.`,
    },
    {
      angle: 'Concept 3: Atmospheric & Emotional Theme',
      conceptName: 'Quiet Resonance',
      description: `Captures the feeling of "${brandFeeling}" through cinematic depth, atmospheric texture, and sophisticated negative space.`,
      visualHook: `Intentionally asymmetrical composition with 70% dark breathing room, leading the eye directly to the refined brand badge.`,
    },
  ];

  const copywritingHooks = [
    {
      headline: `${companyName}: Built for those who demand more.`,
      subline: `Because ${whyChooseUs.toLowerCase().replace(/\.$/, '')}.`,
      cta: 'Experience the standard.',
    },
    {
      headline: `The standard has shifted.`,
      subline: `Designed specifically for ${targetCustomer.toLowerCase().replace(/\.$/, '')}.`,
      cta: 'Explore the direction.',
    },
    {
      headline: `Decisive clarity. Zero compromise.`,
      subline: `Why settle for ordinary when excellence is within reach?`,
      cta: 'Start with Floxa.',
    },
  ];

  const artDirection = {
    composition: 'Swiss-inspired asymmetrical grid with 60-70% focal weight and generous negative space to let the key idea breathe.',
    lightingAndTexture: 'Deep, rich dark-mode shadows with subtle neon chromatic accents and high-grain tactile depth.',
    focalPoint: `The central visual hook and dominant primary headline rendered in ${palette[2].name} (${palette[2].hex}).`,
  };

  const designRules = {
    dos: [
      `Anchor every poster with ${companyName}'s core positioning: "${whyChooseUs}".`,
      `Use generous negative space and tight typography tracking to convey premium authority.`,
      `Maintain the 60-30-10 color rule using ${palette[0].name} (${palette[0].hex}) as dominant and ${palette[2].name} (${palette[2].hex}) as the focal accent.`,
    ],
    donts: [
      'Do NOT use generic corporate stock photography, sterile business clichés, or smiling stock models.',
      'Do NOT clutter the canvas with multiple competing headlines or multi-column paragraph text.',
      'Do NOT dilute the color palette with unauthorized gradient tints or pastel tones.',
    ],
  };

  return {
    brandPersonalityCluster: cluster,
    businessSummary: `${companyName} is established as a forward-thinking ${industry} authority. The business delivers: ${whatBusinessDoes}`,
    targetAudienceSummary: `Target audience: ${targetCustomer}. Visuals and messaging must evoke immediate credibility, effortless relevance, and premium stature.`,
    positioningSummary: `Core market positioning: ${whyChooseUs}. This serves as the unwavering anchor for all campaign themes and poster concepts.`,
    brandFeelingSummary: `Emotional impression: ${brandFeeling}. Emotional cues to preserve: ${emotions}.`,
    visualDirectionSummary: `Visual style foundation: ${visualStyles}. Designed for striking poster compositions, moodboards, and digital touchpoints.`,
    competitorSummary: `Market benchmark references: ${competitors}. Use these to ensure ${companyName} stands distinct and untouchable.`,
    generatedFromDiscovery: true,
    posterConcepts,
    copywritingHooks,
    colorPalette: palette,
    typographyDirectives: typography,
    artDirection,
    designRules,
  };
}
