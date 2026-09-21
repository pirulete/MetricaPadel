"use client"

import { Section, SectionHeader } from "@/components/ui/section"
import { HistoryList } from "@/components/padel/history-list"
import { BottomNav } from "@/components/padel/bottom-nav"

/** /historial — P10 historial de evaluaciones del coach con filtros. */
export default function HistorialPage() {
  return (
    <Section className="py-8 md:py-12">
      <div className="mx-auto max-w-4xl pb-16 md:pb-0">
        <SectionHeader
          title="Historial"
          subtitle="Todas tus evaluaciones, con filtros por curso, alumno y estado"
        />
        <HistoryList />
      </div>
      <BottomNav role="ADMIN" />
    </Section>
  )
}