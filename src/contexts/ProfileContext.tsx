import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthContext'

export interface Profile {
  id: string
  company_name: string
  company_type: string
  email: string
  phone: string
  address: string
  siret: string
  logo_url: string | null
  quote_color: string
  hourly_rate: number
  travel_rate: number
  vat_rate: number
  assistant_name: string
  assistant_voice: string
  greeting_open: string
  greeting_closed: string
  twilio_number: string | null
  onboarding_calendar: string | null
  stripe_customer_id: string | null
  subscription_status: string | null       // trialing | active | canceled | past_due | unpaid
  subscription_trial_end: string | null    // ISO date
  subscription_plan: string | null         // Solo | Pro | Équipe
  transfer_phone: string | null            // Numéro de transfert intelligent E.164
  hours: string | null                     // JSON DaySlot[] — horaires d'ouverture
  email_notifications_enabled: boolean    // Email post-appel activé/désactivé
  timezone: string                         // Fuseau horaire IANA (ex: Europe/Paris)
  intervention_hours: string
  intervention_zone: string
  intervention_delay: string
  travel_fee: string
  pricing_display: string                  // 'explicit' | 'quote_only'
  pricing_tax: string                      // 'ttc' | 'ht'
  pricing_configured: boolean
}

interface ProfileContextType {
  profile: Profile | null
  loading: boolean
  updateProfile: (updates: Partial<Profile>) => Promise<void>
  uploadLogo: (file: File) => Promise<string | null>
  memberRole: 'admin' | 'member' | null  // null = owner, 'admin'/'member' = team member
}

const DEFAULT_PROFILE: Omit<Profile, 'id' | 'email'> = {
  company_name: '',
  company_type: 'Plomberie / Chauffage / Climatisation',
  phone: '',
  address: '',
  siret: '',
  logo_url: null,
  quote_color: '#FF6B35',
  hourly_rate: 65,
  travel_rate: 25,
  vat_rate: 20,
  assistant_name: 'Mia',
  assistant_voice: 'Féminine conviviale',
  greeting_open: "Bonjour, je suis [ASSISTANT_NAME], l'assistante de [COMPANY_NAME]. Comment puis-je vous aider ?",
  greeting_closed: "Bonjour, vous appelez en dehors de nos heures d'ouverture. Je note votre demande et nous vous rappelons rapidement.",
  twilio_number: null,
  onboarding_calendar: null,
  stripe_customer_id: null,
  subscription_status: null,
  subscription_trial_end: null,
  subscription_plan: null,
  transfer_phone: null,
  hours: null,
  email_notifications_enabled: true,
  timezone: 'Europe/Paris',
  intervention_hours: 'Lundi-Vendredi 8h-18h',
  intervention_zone: 'France',
  intervention_delay: 'Sous 48h, urgences sous 4h',
  travel_fee: '50',
  pricing_display: 'explicit',
  pricing_tax: 'ttc',
  pricing_configured: false,
}

const ProfileContext = createContext<ProfileContextType | null>(null)

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [memberRole, setMemberRole] = useState<'admin' | 'member' | null>(null)

  useEffect(() => {
    if (!user) { setProfile(null); setMemberRole(null); setLoading(false); return }
    loadProfile()
  }, [user])

  async function loadProfile() {
    setLoading(true)

    // Vérifier si l'utilisateur est membre d'une équipe
    const { data: membership } = await supabase
      .from('team_members')
      .select('owner_user_id, role')
      .eq('member_user_id', user!.id)
      .eq('status', 'active')
      .maybeSingle()

    if (membership) {
      // Charger le profil du propriétaire du workspace
      const { data: ownerProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', membership.owner_user_id)
        .single()
      setProfile(ownerProfile as Profile)
      setMemberRole(membership.role as 'admin' | 'member')
      setLoading(false)
      return
    }

    // Utilisateur propriétaire
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user!.id)
      .single()

    if (error || !data) {
      const newProfile = { ...DEFAULT_PROFILE, id: user!.id, email: user!.email! }
      const { data: created } = await supabase.from('profiles').insert(newProfile).select().single()
      setProfile(created as Profile)
    } else {
      setProfile(data as Profile)
    }
    setMemberRole(null)
    setLoading(false)
  }

  async function updateProfile(updates: Partial<Profile>) {
    if (!user || !profile) return
    if (memberRole === 'member') return  // membres simples ne peuvent pas modifier le profil
    const updated = { ...profile, ...updates }
    setProfile(updated)
    await supabase.from('profiles').update(updates).eq('id', profile.id)  // profile.id = owner's id
  }

  async function uploadLogo(file: File): Promise<string | null> {
    if (!user || !profile) return null
    if (memberRole === 'member') return null
    const ext = file.name.split('.').pop()
    const path = `${profile.id}/logo.${ext}`
    const { error } = await supabase.storage.from('logos').upload(path, file, { upsert: true })
    if (error) return null
    const { data } = supabase.storage.from('logos').getPublicUrl(path)
    await updateProfile({ logo_url: data.publicUrl })
    return data.publicUrl
  }

  return (
    <ProfileContext.Provider value={{ profile, loading, updateProfile, uploadLogo, memberRole }}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider')
  return ctx
}
