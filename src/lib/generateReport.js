// ============================================================
//  FireComply — PDF Report Generator
//  File: src/lib/generateReport.js
//
//  Uses jsPDF (no server needed — runs entirely in the browser)
//  Install: npm install jspdf
//
//  Usage:
//    import { generateComplianceReport } from './lib/generateReport';
//    await generateComplianceReport({ location, service, issues, repairs });
// ============================================================

import { jsPDF } from "jspdf";

// ─── BRAND COLORS ─────────────────────────────────────────────
const BRAND = {
  red:       [231, 76,  60],   // #e74c3c
  dark:      [17,  17,  17],   // #111111
  gray:      [107, 114, 128],  // #6b7280
  lightGray: [243, 244, 246],  // #f3f4f6
  border:    [229, 231, 235],  // #e5e7eb
  green:     [22,  163, 74],   // #16a34a
  yellow:    [217, 119, 6],    // #d97706
  white:     [255, 255, 255],
};

const STATUS_LABELS = {
  compliant: "COMPLIANT",
  issues:    "ISSUES FOUND",
  overdue:   "OVERDUE",
};
const STATUS_COLORS = {
  compliant: BRAND.green,
  issues:    BRAND.yellow,
  overdue:   BRAND.red,
};
const SEV_COLORS = {
  low:    BRAND.green,
  medium: BRAND.yellow,
  high:   BRAND.red,
};
const REPAIR_LABELS = {
  pending:   "PENDING",
  approved:  "APPROVED",
  completed: "COMPLETED",
};

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// ─── DRAWING HELPERS ──────────────────────────────────────────

function drawRect(doc, x, y, w, h, color, radius = 0) {
  doc.setFillColor(...color);
  if (radius > 0) {
    doc.roundedRect(x, y, w, h, radius, radius, "F");
  } else {
    doc.rect(x, y, w, h, "F");
  }
}

function drawLine(doc, x1, y1, x2, y2, color, width = 0.3) {
  doc.setDrawColor(...color);
  doc.setLineWidth(width);
  doc.line(x1, y1, x2, y2);
}

function text(doc, str, x, y, opts = {}) {
  const {
    size = 10, color = BRAND.dark, bold = false,
    align = "left", maxWidth,
  } = opts;
  doc.setFontSize(size);
  doc.setTextColor(...color);
  doc.setFont("helvetica", bold ? "bold" : "normal");
  if (maxWidth) {
    const lines = doc.splitTextToSize(String(str), maxWidth);
    doc.text(lines, x, y, { align });
    return lines.length * (size * 0.4);
  }
  doc.text(String(str), x, y, { align });
  return size * 0.4;
}

function badge(doc, label, x, y, color) {
  const w = doc.getTextWidth(label) + 8;
  drawRect(doc, x, y - 4, w, 6, color.map(c => Math.min(255, c + 180)), 1.5);
  doc.setFontSize(7);
  doc.setTextColor(...color);
  doc.setFont("helvetica", "bold");
  doc.text(label, x + 4, y, {});
  return w;
}

// ─── MAIN EXPORT ──────────────────────────────────────────────

/**
 * generateComplianceReport
 *
 * @param {Object} params
 * @param {Object} params.location  - Location record from Supabase
 * @param {Object} params.service   - Service record (with service_photos array)
 * @param {Array}  params.issues    - Issues array for this service/location
 * @param {Array}  params.repairs   - Repairs array for this location
 * @param {string} params.companyName - Your company name (optional)
 */
export async function generateComplianceReport({
  location,
  service,
  issues = [],
  repairs = [],
  companyName = "FireComply Services",
}) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const W = 210; // page width mm
  const H = 297; // page height mm
  const MARGIN = 16;
  const CONTENT_W = W - MARGIN * 2;
  let y = 0;

  // ── PAGE 1: HEADER ────────────────────────────────────────

  // Full-width red header bar
  drawRect(doc, 0, 0, W, 42, BRAND.red);

  // Flame icon area (simple circle)
  drawRect(doc, MARGIN, 9, 24, 24, [255, 255, 255, 40], 4);
  text(doc, "🔥", MARGIN + 4, 23, { size: 16, color: BRAND.white });

  // Company name
  text(doc, "FIRECOMPLOY", MARGIN + 30, 18, { size: 18, bold: true, color: BRAND.white });
  text(doc, "Kitchen Exhaust Compliance System", MARGIN + 30, 25, { size: 8, color: [255, 200, 200] });

  // Report label top right
  text(doc, "COMPLIANCE REPORT", W - MARGIN, 16, { size: 10, bold: true, color: BRAND.white, align: "right" });
  text(doc, `Generated ${fmtDate(new Date())}`, W - MARGIN, 23, { size: 8, color: [255, 200, 200], align: "right" });

  // Report ID
  const reportId = `FC-${Date.now().toString(36).toUpperCase()}`;
  text(doc, `Report ID: ${reportId}`, W - MARGIN, 30, { size: 7, color: [255, 200, 200], align: "right" });

  y = 52;

  // ── STATUS BANNER ─────────────────────────────────────────

  const statusColor = STATUS_COLORS[service?.compliance_status] || BRAND.gray;
  const statusLabel = STATUS_LABELS[service?.compliance_status] || "UNKNOWN";
  drawRect(doc, MARGIN, y, CONTENT_W, 18, statusColor.map(c => Math.min(255, c + 190)), 3);
  drawRect(doc, MARGIN, y, 4, 18, statusColor, 0);

  // Status dot
  doc.setFillColor(...statusColor);
  doc.circle(MARGIN + 12, y + 9, 3, "F");

  text(doc, statusLabel, MARGIN + 20, y + 6, { size: 11, bold: true, color: statusColor });
  text(doc, `Service Date: ${fmtDate(service?.service_date)}`, MARGIN + 20, y + 12, { size: 8, color: BRAND.gray });

  // Technician right side
  text(doc, service?.technician_name || "—", W - MARGIN, y + 6, { size: 9, bold: true, color: BRAND.dark, align: "right" });
  text(doc, "Technician", W - MARGIN, y + 12, { size: 7, color: BRAND.gray, align: "right" });

  y += 26;

  // ── LOCATION DETAILS ──────────────────────────────────────

  text(doc, "LOCATION DETAILS", MARGIN, y, { size: 8, bold: true, color: BRAND.gray });
  drawLine(doc, MARGIN, y + 2, W - MARGIN, y + 2, BRAND.border);
  y += 8;

  // Two-column grid
  const col1x = MARGIN;
  const col2x = MARGIN + CONTENT_W / 2 + 4;
  const colW  = CONTENT_W / 2 - 4;

  const details = [
    ["Location Name",  location?.name || "—"],
    ["Address",        location?.address || "—"],
    ["Contact",        location?.contact_name || "—"],
    ["Email",          location?.contact_email || "—"],
  ];

  details.forEach(([label, val], i) => {
    const cx = i % 2 === 0 ? col1x : col2x;
    const row = Math.floor(i / 2);
    const ry = y + row * 14;
    text(doc, label.toUpperCase(), cx, ry, { size: 7, color: BRAND.gray, bold: true });
    text(doc, val, cx, ry + 5, { size: 9, color: BRAND.dark, maxWidth: colW });
  });

  y += Math.ceil(details.length / 2) * 14 + 6;

  // Next service due
  drawRect(doc, MARGIN, y, CONTENT_W, 12, BRAND.lightGray, 2);
  text(doc, "Last Service:", MARGIN + 4, y + 7.5, { size: 8, color: BRAND.gray });
  text(doc, fmtDate(location?.last_service_date), MARGIN + 30, y + 7.5, { size: 8, bold: true, color: BRAND.dark });
  text(doc, "Next Due:", W / 2, y + 7.5, { size: 8, color: BRAND.gray });
  text(doc, fmtDate(location?.next_due_date), W / 2 + 22, y + 7.5, { size: 8, bold: true, color: BRAND.dark });
  y += 20;

  // ── SERVICE NOTES ─────────────────────────────────────────

  text(doc, "SERVICE NOTES", MARGIN, y, { size: 8, bold: true, color: BRAND.gray });
  drawLine(doc, MARGIN, y + 2, W - MARGIN, y + 2, BRAND.border);
  y += 8;

  const notes = service?.notes || "No notes recorded for this service.";
  drawRect(doc, MARGIN, y, CONTENT_W, 28, BRAND.lightGray, 2);
  const notesLines = doc.splitTextToSize(notes, CONTENT_W - 8);
  doc.setFontSize(9);
  doc.setTextColor(...BRAND.dark);
  doc.setFont("helvetica", "normal");
  doc.text(notesLines.slice(0, 5), MARGIN + 4, y + 7);
  y += 36;

  // ── ISSUES ────────────────────────────────────────────────

  text(doc, `DEFICIENCIES & ISSUES  (${issues.length})`, MARGIN, y, { size: 8, bold: true, color: BRAND.gray });
  drawLine(doc, MARGIN, y + 2, W - MARGIN, y + 2, BRAND.border);
  y += 8;

  if (issues.length === 0) {
    drawRect(doc, MARGIN, y, CONTENT_W, 12, BRAND.lightGray, 2);
    text(doc, "No deficiencies recorded for this service.", MARGIN + 4, y + 7.5, { size: 9, color: BRAND.gray });
    y += 18;
  } else {
    issues.forEach((iss, i) => {
      // Check if we need a new page
      if (y > 250) {
        doc.addPage();
        y = MARGIN;
        drawRect(doc, 0, 0, W, 14, BRAND.red);
        text(doc, "FireComply — Compliance Report (continued)", MARGIN, 9, { size: 8, bold: true, color: BRAND.white });
        y = 22;
      }

      const sevColor = SEV_COLORS[iss.severity] || BRAND.gray;
      drawRect(doc, MARGIN, y, CONTENT_W, 20, BRAND.lightGray, 2);
      drawRect(doc, MARGIN, y, 3, 20, sevColor, 0);

      // Issue number
      text(doc, `${String(i + 1).padStart(2, "0")}`, MARGIN + 7, y + 7, { size: 9, bold: true, color: BRAND.gray });

      // Title
      text(doc, iss.title, MARGIN + 18, y + 7, { size: 9, bold: true, color: BRAND.dark, maxWidth: CONTENT_W - 60 });

      // Severity badge
      badge(doc, (iss.severity || "").toUpperCase(), W - MARGIN - 24, y + 7, sevColor);

      // Status
      text(doc, iss.status === "open" ? "● OPEN" : "✓ RESOLVED", W - MARGIN, y + 14, { size: 7, color: iss.status === "open" ? BRAND.red : BRAND.green, align: "right" });

      // Description
      if (iss.description) {
        const descLines = doc.splitTextToSize(iss.description, CONTENT_W - 24);
        doc.setFontSize(8);
        doc.setTextColor(...BRAND.gray);
        doc.setFont("helvetica", "normal");
        doc.text(descLines.slice(0, 2), MARGIN + 18, y + 13);
      }

      text(doc, `Identified: ${fmtDate(iss.created_at)}`, MARGIN + 18, y + 18, { size: 7, color: BRAND.gray });

      y += 26;
    });
  }

  y += 4;

  // ── REPAIR RECOMMENDATIONS ────────────────────────────────

  if (y > 230) { doc.addPage(); y = MARGIN; }

  text(doc, `REPAIR RECOMMENDATIONS  (${repairs.length})`, MARGIN, y, { size: 8, bold: true, color: BRAND.gray });
  drawLine(doc, MARGIN, y + 2, W - MARGIN, y + 2, BRAND.border);
  y += 8;

  if (repairs.length === 0) {
    drawRect(doc, MARGIN, y, CONTENT_W, 12, BRAND.lightGray, 2);
    text(doc, "No repair recommendations on record.", MARGIN + 4, y + 7.5, { size: 9, color: BRAND.gray });
    y += 18;
  } else {
    let totalCost = 0;
    repairs.forEach((rep, i) => {
      if (y > 250) { doc.addPage(); y = MARGIN; }

      const rColor = rep.status === "completed" ? BRAND.green : rep.status === "approved" ? [37, 99, 235] : BRAND.yellow;
      drawRect(doc, MARGIN, y, CONTENT_W, 16, BRAND.lightGray, 2);

      text(doc, rep.description, MARGIN + 4, y + 6, { size: 9, color: BRAND.dark, maxWidth: CONTENT_W - 50 });
      text(doc, REPAIR_LABELS[rep.status] || "PENDING", W - MARGIN - 4, y + 6, { size: 7, bold: true, color: rColor, align: "right" });
      text(doc, `$${(rep.estimated_cost || 0).toLocaleString()}`, W - MARGIN - 4, y + 12, { size: 10, bold: true, color: BRAND.dark, align: "right" });

      totalCost += rep.estimated_cost || 0;
      y += 20;
    });

    // Total
    drawRect(doc, MARGIN, y, CONTENT_W, 14, BRAND.dark, 2);
    text(doc, "TOTAL ESTIMATED COST", MARGIN + 4, y + 9, { size: 9, bold: true, color: [160, 160, 160] });
    text(doc, `$${totalCost.toLocaleString()}`, W - MARGIN - 4, y + 9, { size: 12, bold: true, color: BRAND.white, align: "right" });
    y += 20;
  }

  // ── SIGNATURE BLOCK ───────────────────────────────────────

  if (y > 240) { doc.addPage(); y = MARGIN; }
  y += 8;

  drawLine(doc, MARGIN, y, W - MARGIN, y, BRAND.border, 0.5);
  y += 10;

  // Two signature lines
  const sigY = y + 20;
  drawLine(doc, MARGIN, sigY, MARGIN + 70, sigY, BRAND.dark, 0.3);
  text(doc, "Technician Signature", MARGIN, sigY + 5, { size: 7, color: BRAND.gray });
  text(doc, service?.technician_name || "—", MARGIN, sigY + 10, { size: 8, bold: true, color: BRAND.dark });

  drawLine(doc, W - MARGIN - 70, sigY, W - MARGIN, sigY, BRAND.dark, 0.3);
  text(doc, "Date", W - MARGIN - 70, sigY + 5, { size: 7, color: BRAND.gray });
  text(doc, fmtDate(service?.service_date), W - MARGIN - 70, sigY + 10, { size: 8, bold: true, color: BRAND.dark });

  y = sigY + 20;

  // ── FOOTER ────────────────────────────────────────────────

  // Add footer to all pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawRect(doc, 0, H - 14, W, 14, BRAND.lightGray);
    drawLine(doc, 0, H - 14, W, H - 14, BRAND.border, 0.3);
    text(doc, `FireComply · ${companyName} · Report ${reportId}`, MARGIN, H - 6, { size: 7, color: BRAND.gray });
    text(doc, `Page ${p} of ${totalPages}`, W - MARGIN, H - 6, { size: 7, color: BRAND.gray, align: "right" });
    text(doc, "This document is an official compliance record. Retain for minimum 3 years.", W / 2, H - 6, { size: 6, color: BRAND.gray, align: "center" });
  }

  // ── SAVE ──────────────────────────────────────────────────

  const filename = `FireComply_${(location?.name || "Report").replace(/\s+/g, "_")}_${service?.service_date || "unknown"}.pdf`;
  doc.save(filename);
  return filename;
}


// ============================================================
//  REACT COMPONENT — Drop-in "Download Report" button
//  Usage: <DownloadReportButton location={loc} service={svc} issues={issues} repairs={repairs} />
// ============================================================

import { useState } from "react";

export function DownloadReportButton({ location, service, issues, repairs, style = {} }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleDownload() {
    setLoading(true);
    try {
      await generateComplianceReport({ location, service, issues, repairs });
      setDone(true);
      setTimeout(() => setDone(false), 3000);
    } catch (e) {
      console.error("PDF generation failed:", e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        width: "100%",
        background: done ? "#16a34a" : loading ? "#f3f4f6" : "#111",
        color: done || loading ? (done ? "#fff" : "#9ca3af") : "#fff",
        border: "none",
        borderRadius: 12,
        padding: "14px 20px",
        fontSize: 15,
        fontWeight: 700,
        cursor: loading ? "not-allowed" : "pointer",
        transition: "background 0.2s",
        fontFamily: "inherit",
        ...style,
      }}
    >
      {loading ? (
        <>
          <span style={{ width: 16, height: 16, border: "2px solid #d1d5db", borderTop: "2px solid #9ca3af", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} />
          Generating PDF...
        </>
      ) : done ? (
        <>✓ Downloaded!</>
      ) : (
        <>📄 Download Compliance Report</>
      )}
    </button>
  );
}
