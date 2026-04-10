import jsPDF from 'jspdf'
import type { Profile } from '@/contexts/ProfileContext'

export interface QuoteLine {
  id: number
  desig: string
  qty: number
  unit: string
  pu: number
  vat: number
}

export interface QuoteData {
  number: string
  date: string
  validity: string
  object: string
  clientName: string
  clientAddress: string
  clientEmail: string
  clientPhone: string
  notes: string
  lines: QuoteLine[]
  signatureDataUrl?: string
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

function fmtEur(v: number): string {
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

export async function generateQuotePDF(profile: Profile, quote: QuoteData, returnBase64?: boolean): Promise<string | void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  const margin = 15
  const contentW = W - margin * 2
  const accent: [number, number, number] = hexToRgb(profile.quote_color || '#FF6B35')
  const accentLight: [number, number, number] = [
    Math.min(255, accent[0] + 40),
    Math.min(255, accent[1] + 60),
    Math.min(255, accent[2] + 50),
  ]
  const gray: [number, number, number] = [107, 114, 128]
  const dark: [number, number, number] = [26, 26, 26]
  const lightBg: [number, number, number] = [249, 250, 251]
  const borderColor: [number, number, number] = [229, 231, 235]

  let y = 14

  // ── LOGO or company name ──────────────────────────────────────────────────
  if (profile.logo_url) {
    try {
      const img = await loadImage(profile.logo_url)
      const maxH = 18, maxW = 50
      const ratio = Math.min(maxW / img.width, maxH / img.height)
      doc.addImage(img.dataUrl, 'JPEG', margin, y, img.width * ratio, img.height * ratio)
    } catch {
      doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(...accent)
      doc.text('F', margin, y + 8)
      doc.setTextColor(...dark)
      doc.text(' Fixlyy', margin + 5, y + 8)
    }
  } else {
    doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(...accent)
    doc.text('F', margin, y + 8)
    doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(...dark)
    doc.text(' Fixlyy', margin + 5, y + 8)
  }

  // Quote label + number top right
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...dark)
  doc.text('DEVIS', W - margin, y + 5, { align: 'right' })
  doc.setFont('helvetica', 'normal').setFontSize(11).setTextColor(...accent)
  doc.text(quote.number, W - margin, y + 12, { align: 'right' })

  y += 22

  // Orange rule
  doc.setDrawColor(...accent)
  doc.setLineWidth(0.8)
  doc.line(margin, y, W - margin, y)
  y += 6

  // ── META BAR ─────────────────────────────────────────────────────────────
  doc.setFillColor(...lightBg)
  doc.setDrawColor(...borderColor)
  doc.setLineWidth(0.3)
  doc.roundedRect(margin, y, contentW, 18, 2, 2, 'FD')

  const col1 = margin + 4, col2 = margin + 52, col3 = margin + 102

  doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...gray)
  doc.text("Date d'émission", col1, y + 5)
  doc.text('Valable jusqu\'au', col2, y + 5)
  doc.text('Objet', col3, y + 5)

  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...dark)
  doc.text(quote.date, col1, y + 11)
  doc.text(quote.validity, col2, y + 11)
  const obj = doc.splitTextToSize(quote.object, contentW - 106)
  doc.text(obj[0] || '', col3, y + 11)

  y += 24

  // ── ARTISAN / CLIENT CARDS ────────────────────────────────────────────────
  const cardW = (contentW - 6) / 2

  // Artisan card (light bg)
  doc.setFillColor(...lightBg)
  doc.setDrawColor(...borderColor)
  doc.setLineWidth(0.3)
  doc.roundedRect(margin, y, cardW, 36, 2, 2, 'FD')

  // Client card (accent-light bg)
  doc.setFillColor(...accentLight)
  doc.setDrawColor(...borderColor)
  doc.roundedRect(margin + cardW + 6, y, cardW, 36, 2, 2, 'FD')

  const printCard = (x: number, d: { title: string; name: string; lines: string[] }) => {
    doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor(...accent)
    doc.text(d.title, x + 4, y + 6)
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...dark)
    doc.text(d.name, x + 4, y + 12)
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...gray)
    d.lines.forEach((l, i) => doc.text(l, x + 4, y + 18 + i * 5))
  }

  printCard(margin, {
    title: 'VOTRE ARTISAN',
    name: profile.company_name || 'Mon entreprise',
    lines: [profile.address || '', profile.phone || '', profile.email || '', profile.siret ? `SIRET : ${profile.siret}` : ''].filter(Boolean),
  })

  printCard(margin + cardW + 6, {
    title: 'CLIENT',
    name: quote.clientName || '—',
    lines: [quote.clientAddress, quote.clientEmail, quote.clientPhone].filter(Boolean),
  })

  y += 42

  // ── LINES TABLE ───────────────────────────────────────────────────────────
  const cols = [
    { label: 'DÉSIGNATION', x: margin, w: contentW * 0.42, align: 'left' as const },
    { label: 'QTÉ', x: margin + contentW * 0.42, w: contentW * 0.08, align: 'right' as const },
    { label: 'UNITÉ', x: margin + contentW * 0.50, w: contentW * 0.09, align: 'right' as const },
    { label: 'P.U. HT', x: margin + contentW * 0.59, w: contentW * 0.13, align: 'right' as const },
    { label: 'TVA', x: margin + contentW * 0.72, w: contentW * 0.09, align: 'right' as const },
    { label: 'TOTAL HT', x: margin + contentW * 0.81, w: contentW * 0.19, align: 'right' as const },
  ]

  // Header row
  doc.setFillColor(...accent)
  doc.rect(margin, y, contentW, 9, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(255, 255, 255)
  cols.forEach(c => {
    const tx = c.align === 'right' ? c.x + c.w - 2 : c.x + 2
    doc.text(c.label, tx, y + 6, { align: c.align })
  })
  y += 9

  // Data rows
  let totalHT = 0, totalVAT = 0
  quote.lines.forEach((line, i) => {
    const lht = line.qty * line.pu
    const lv = lht * line.vat / 100
    totalHT += lht
    totalVAT += lv

    const rowBg: [number, number, number] = i % 2 === 0 ? [255, 255, 255] : lightBg
    doc.setFillColor(...rowBg)
    doc.rect(margin, y, contentW, 9, 'F')
    doc.setDrawColor(...borderColor)
    doc.setLineWidth(0.2)
    doc.line(margin, y + 9, margin + contentW, y + 9)

    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...dark)
    const desigLines = doc.splitTextToSize(line.desig, cols[0].w - 4)
    doc.text(desigLines[0] || '', cols[0].x + 2, y + 6)

    const vals = [
      line.qty % 1 === 0 ? String(line.qty) : line.qty.toFixed(1),
      line.unit,
      fmtEur(line.pu),
      `${line.vat} %`,
      fmtEur(lht),
    ]
    cols.slice(1).forEach((c, ci) => {
      doc.text(vals[ci], c.x + c.w - 2, y + 6, { align: 'right' })
    })
    y += 9
  })

  // Border around table
  doc.setDrawColor(...borderColor)
  doc.setLineWidth(0.3)
  doc.rect(margin, y - quote.lines.length * 9 - 9, contentW, quote.lines.length * 9 + 9)

  y += 6

  // ── TOTALS ────────────────────────────────────────────────────────────────
  const totalTTC = totalHT + totalVAT
  const totW = 70, totX = W - margin - totW

  const drawTotRow = (label: string, val: string, bold = false) => {
    if (bold) {
      doc.setFillColor(...accentLight)
      doc.roundedRect(totX - 4, y - 4, totW + 4, 12, 2, 2, 'F')
      doc.setDrawColor(...accent)
      doc.setLineWidth(0.5)
      doc.line(totX - 4, y - 4, totX + totW, y - 4)
    }
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
      .setFontSize(bold ? 11 : 8.5)
      .setTextColor(bold ? dark[0] : gray[0], bold ? dark[1] : gray[1], bold ? dark[2] : gray[2])
    doc.text(label, totX, y + 4)
    doc.setTextColor(bold ? accent[0] : dark[0], bold ? accent[1] : dark[1], bold ? accent[2] : dark[2])
    doc.text(val, W - margin, y + 4, { align: 'right' })
    y += bold ? 14 : 9
  }

  drawTotRow('Total HT', fmtEur(totalHT))
  drawTotRow(`TVA ${quote.lines[0]?.vat ?? 20} %`, fmtEur(totalVAT))
  drawTotRow('Total TTC', fmtEur(totalTTC), true)

  y += 6

  // ── SIGNATURE BOX ─────────────────────────────────────────────────────────
  const sigBoxW = (contentW - 5) / 2
  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(...borderColor)
  doc.setLineWidth(0.3)

  // Boîte gauche : Signature de l'artisan
  doc.rect(margin, y, sigBoxW, 28)
  doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...gray)
  doc.text("Signature de l'artisan", margin + 3, y + 5)
  if (quote.signatureDataUrl) {
    doc.addImage(quote.signatureDataUrl, 'PNG', margin + 2, y + 8, sigBoxW - 4, 14)
  }

  // Boîte droite : Bon pour accord + Date
  const rightX = margin + sigBoxW + 5
  doc.rect(rightX, y, sigBoxW, 28)
  doc.text('Bon pour accord — Signature client', rightX + 3, y + 5)
  doc.text('Date', rightX + 3, y + 20)

  y += 34

  // ── NOTES ─────────────────────────────────────────────────────────────────
  if (quote.notes) {
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...gray)
    doc.text('Notes et conditions', margin, y)
    y += 5
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...gray)
    const noteLines = doc.splitTextToSize(quote.notes, contentW)
    doc.text(noteLines, margin, y)
    y += noteLines.length * 4.5 + 4
  }

  // ── FOOTER ────────────────────────────────────────────────────────────────
  const pageH = 297
  doc.setDrawColor(...borderColor)
  doc.setLineWidth(0.3)
  doc.line(margin, pageH - 14, W - margin, pageH - 14)
  doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...gray)
  doc.text(
    `Fixlyy — Secrétaire IA 24/7 pour artisans  |  support@fixlyy.fr  |  Devis valable 30 jours à compter du ${quote.date}`,
    W / 2, pageH - 9, { align: 'center' }
  )

  if (returnBase64) {
    return doc.output('datauristring').split(',')[1]
  }
  doc.save(`devis-${quote.number}.pdf`)
}

function loadImage(url: string): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      // Cap à 400x200px max pour garder le PDF léger
      const MAX_W = 400, MAX_H = 200
      const ratio = Math.min(MAX_W / img.width, MAX_H / img.height, 1)
      const w = Math.round(img.width * ratio)
      const h = Math.round(img.height * ratio)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      // JPEG 0.85 au lieu de PNG — divise la taille par 10
      resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.85), width: w, height: h })
    }
    img.onerror = reject
    img.src = url
  })
}
