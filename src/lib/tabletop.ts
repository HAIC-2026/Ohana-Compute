export const tabletopScenarios = [
  {
    id: 'hurricane-hawaii',
    name: 'Hurricane approaching Hawaiʻi Island',
    county: 'Hawaiʻi County',
    map: 'A fictional forecast threatens Hilo and Lower Puna in 48 hours. Off-grid catchment homes may lose water treatment; roads and power may fail. This is not a current forecast.',
    model:
      'Inject: wind arrival moves forward. One practice access corridor is unusable and backup-power delivery is delayed. Do not invent a safe alternate road.',
    match:
      'Inject: connectivity is lost and a practice shelter cannot confirm generator readiness. County leadership must decide what to verify and what not to promise.',
    households: 120,
    checks: [
      'C: identify trusted multilingual and non-digital alert channels',
      'M: verify backup power and continuity of oxygen / dialysis support',
      'I: verify accessible spaces, toilets and assistive-device support',
      'S: include caregivers, pets and service animals in shelter planning',
      'T: confirm transport and road access with County authorities',
    ],
  },
  {
    id: 'wildfire-maui',
    name: 'Little-notice wildfire on Maui',
    county: 'Maui County',
    map: 'Fictional smoke threatens a West Maui practice area with 20 minutes of notice. Visitors and residents without cars need understandable instructions. This is not a live fire or evacuation order.',
    model:
      'Inject: a practice road closes and paratransit status is unknown. A named practice site is not proof of an open, accessible shelter.',
    match:
      'Inject: cellular service becomes intermittent. A community partner can relay messages but cannot authorize evacuation or confirm transport capacity.',
    households: 60,
    checks: [
      'C: prepare plain-language, multilingual and accessible messages',
      'M: identify medical continuity and smoke-exposure planning checks',
      'I: verify accessible transport and assistive-device support',
      'S: account for stranded visitors, caregivers and safe family reunification',
      'T: ask County officials to verify road and paratransit status',
    ],
  },
] as const

export const exerciseStages = ['MAP', 'MODEL', 'MATCH'] as const
export const injectSeconds = [0, 60, 120] as const
