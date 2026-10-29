import { create } from 'zustand'

import { activeEvents, residentRoutePlans } from '../lib/mock-data'
import type { HazardId, LayerId, PostalLocation } from '../lib/mock-data'

type MobilePanel = 'scenario' | 'insights' | 'resident' | 'conversation' | null

type PlanningState = {
  statewideOverview: boolean
  showStatewideOverview: () => void
  hazard: HazardId
  severity: number
  selectedEventId: string | null
  selectedAreaId: string
  locationFocus: PostalLocation | null
  selectedPlanningZoneId: string | null
  selectedNeighborhoodId: string | null
  selectedResidentPlanId: string
  selectedResidentResourceId: string
  residentNoCar: boolean
  residentMobilityHelp: boolean
  residentMedicalPower: boolean
  preferredLanguage: string
  activeLayers: LayerId[]
  mobilePanel: MobilePanel
  briefReady: boolean
  confirmedResourceIds: string[]
  selectedResourceId: string | null
  setHazard: (hazard: HazardId) => void
  setSeverity: (severity: number) => void
  selectActiveEvent: (eventId: string) => void
  setSelectedAreaId: (areaId: string) => void
  setLocationFocus: (location: PostalLocation | null) => void
  selectPlanningZone: (zoneId: string, areaId: string) => void
  selectNeighborhood: (neighborhoodId: string) => void
  selectResidentPlan: (planId: string) => void
  selectResidentResource: (resourceId: string) => void
  setResidentNoCar: (value: boolean) => void
  setResidentMobilityHelp: (value: boolean) => void
  setResidentMedicalPower: (value: boolean) => void
  setPreferredLanguage: (language: string) => void
  showPostalOverview: (areaId: string) => void
  toggleLayer: (layer: LayerId) => void
  setMobilePanel: (panel: MobilePanel) => void
  setBriefReady: (ready: boolean) => void
  confirmResource: (resourceId: string) => void
  selectResource: (resourceId: string | null) => void
}

function residentSelectionForArea(areaId: string) {
  const plan = residentRoutePlans.find((item) => item.areaId === areaId)
  return {
    selectedResidentPlanId: plan?.id ?? '',
    selectedResidentResourceId: plan?.resources[0]?.id ?? '',
  }
}

export const usePlanningStore = create<PlanningState>((set) => ({
  statewideOverview: true,
  showStatewideOverview: () =>
    set({
      statewideOverview: true,
      locationFocus: null,
      selectedPlanningZoneId: null,
      selectedNeighborhoodId: null,
      selectedResourceId: null,
      briefReady: false,
    }),
  hazard: 'hurricane',
  severity: 4,
  selectedEventId: 'hurricane-lala',
  selectedAreaId: 'oahu-town',
  locationFocus: null,
  selectedPlanningZoneId: null,
  selectedNeighborhoodId: 'manoa-makiki',
  selectedResidentPlanId: 'resident-manoa',
  selectedResidentResourceId: 'manoa-shelter',
  residentNoCar: false,
  residentMobilityHelp: false,
  residentMedicalPower: false,
  preferredLanguage: 'English',
  activeLayers: [],
  mobilePanel: null,
  briefReady: false,
  confirmedResourceIds: [],
  selectedResourceId: null,
  setHazard: (hazard) =>
    set({ hazard, selectedEventId: null, briefReady: false }),
  setSeverity: (severity) =>
    set({ severity, selectedEventId: null, briefReady: false }),
  selectActiveEvent: (selectedEventId) => {
    const event = activeEvents.find((item) => item.id === selectedEventId)
    if (!event) return
    set({
      selectedEventId,
      hazard: event.hazard,
      severity: event.severity,
      briefReady: false,
    })
  },
  setSelectedAreaId: (selectedAreaId) =>
    set({
      statewideOverview: false,
      selectedAreaId,
      ...residentSelectionForArea(selectedAreaId),
      locationFocus: null,
      selectedPlanningZoneId: null,
      selectedNeighborhoodId: null,
      selectedResourceId: null,
      briefReady: false,
    }),
  setLocationFocus: (locationFocus) =>
    set({
      statewideOverview: false,
      locationFocus,
      selectedPlanningZoneId: null,
      selectedNeighborhoodId: null,
      briefReady: false,
    }),
  selectPlanningZone: (selectedPlanningZoneId, selectedAreaId) =>
    set({
      statewideOverview: false,
      selectedPlanningZoneId,
      selectedAreaId,
      ...residentSelectionForArea(selectedAreaId),
      selectedNeighborhoodId: null,
      briefReady: false,
    }),
  selectNeighborhood: (selectedNeighborhoodId) =>
    set({
      statewideOverview: false,
      selectedNeighborhoodId,
      briefReady: false,
    }),
  selectResidentPlan: (selectedResidentPlanId) => {
    const plan = residentRoutePlans.find(
      (item) => item.id === selectedResidentPlanId,
    )
    if (!plan) return
    set({
      statewideOverview: false,
      selectedResidentPlanId,
      selectedResidentResourceId: plan.resources[0].id,
      selectedNeighborhoodId: plan.neighborhoodId,
      selectedAreaId: plan.areaId,
      locationFocus: null,
      selectedPlanningZoneId: null,
      briefReady: false,
    })
  },
  selectResidentResource: (selectedResidentResourceId) =>
    set({ selectedResidentResourceId }),
  setResidentNoCar: (residentNoCar) => set({ residentNoCar }),
  setResidentMobilityHelp: (residentMobilityHelp) =>
    set({ residentMobilityHelp }),
  setResidentMedicalPower: (residentMedicalPower) =>
    set({ residentMedicalPower }),
  setPreferredLanguage: (preferredLanguage) => set({ preferredLanguage }),
  showPostalOverview: (selectedAreaId) =>
    set({
      statewideOverview: false,
      selectedPlanningZoneId: null,
      selectedNeighborhoodId: null,
      selectedAreaId,
      ...residentSelectionForArea(selectedAreaId),
      briefReady: false,
    }),
  toggleLayer: (layer) =>
    set((state) => ({
      activeLayers: state.activeLayers.includes(layer)
        ? state.activeLayers.filter((item) => item !== layer)
        : [...state.activeLayers, layer],
      briefReady: false,
    })),
  setMobilePanel: (mobilePanel) => set({ mobilePanel }),
  setBriefReady: (briefReady) => set({ briefReady }),
  confirmResource: (resourceId) =>
    set((state) => ({
      confirmedResourceIds: state.confirmedResourceIds.includes(resourceId)
        ? state.confirmedResourceIds
        : [...state.confirmedResourceIds, resourceId],
    })),
  selectResource: (selectedResourceId) => set({ selectedResourceId }),
}))
