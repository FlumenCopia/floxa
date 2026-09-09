export function buildBrandDNAData(project: any, discovery: any) {
  const profile = project.clientProfile;
  const companyName = profile?.companyName || project.companyName;
  const industry = profile?.industry || project.sector;

  const emotions = (discovery.emotions || []).join(', ') || 'clear, confident, and trustworthy';
  const visualStyles = (discovery.visualStyles || []).join(', ') || 'clean, intentional visual direction';
  const competitors = (discovery.competitors || [])
    .slice(0, 5)
    .map((c: any) => `${c.name} (${c.rating})`)
    .join(', ') || 'No competitor references submitted.';

  // Calculate slider cluster
  const sliders = discovery.sliders || [];
  let cluster = 'Bold Challenger';

  if (sliders.length > 0) {
    const scores = sliders.map((s: any) => {
      const score = ((s.value || 50) / 100) * 6 - 3;
      return { score, distance: Math.abs(score) };
    });
    const avg = scores.reduce((sum: number, item: any) => sum + item.score, 0) / scores.length;
    if (avg < -1.5) cluster = 'Soft Minimalist';
    else if (avg < -0.4) cluster = 'Quiet Specialist';
    else if (avg < 0.8) cluster = 'Balanced Clarity';
    else if (avg < 2.1) cluster = 'Bold Challenger';
    else cluster = 'Electric Leader';
  }

  const archetype = cluster || discovery.audienceArchetype || 'Quality-focused audience';

  return {
    brandPersonalityCluster: archetype,
    businessSummary: `${companyName} should be presented as a focused ${industry} brand. The business is described as: ${discovery.whatBusinessDoes || 'Not submitted yet.'}`,
    targetAudienceSummary: `The brand should speak to ${discovery.targetCustomer || 'the target customer'}. Messaging and visuals should make the offer feel relevant, credible, and easy to choose.`,
    positioningSummary: `The core reason to choose this brand is: ${discovery.whyChooseUs || 'Not submitted yet.'} This should become the foundation for the brand's positioning and designer brief.`,
    brandFeelingSummary: `The brand should make people feel ${discovery.brandFeeling || 'confident and clear'}. Emotional cues to preserve include ${emotions}.`,
    visualDirectionSummary: `Recommended visual direction: ${visualStyles}. This should guide moodboards, typography, color, composition, and early concepts.`,
    competitorSummary: `Competitor notes: ${competitors}. Use these references to understand the client's taste, then build a distinct direction.`,
    generatedFromDiscovery: true,
  };
}
