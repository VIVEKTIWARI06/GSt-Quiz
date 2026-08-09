import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

// Generates a simple, clean landscape certificate as PDF bytes.
// Kept deliberately lightweight (no images) so it runs comfortably
// inside a Worker's CPU budget.
export async function generateCertificatePdf({ studentName, courseName, percent, dateStr }) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([842, 595]); // A4 landscape
  const { width, height } = page.getSize();

  const serif = await doc.embedFont(StandardFonts.TimesRomanBold);
  const serifRegular = await doc.embedFont(StandardFonts.TimesRoman);

  const navy = rgb(0.06, 0.16, 0.32);
  const gold = rgb(0.7, 0.55, 0.15);

  // Border
  page.drawRectangle({
    x: 24, y: 24, width: width - 48, height: height - 48,
    borderColor: gold, borderWidth: 3,
  });
  page.drawRectangle({
    x: 34, y: 34, width: width - 68, height: height - 68,
    borderColor: navy, borderWidth: 1,
  });

  const centerText = (text, y, font, size, color = navy) => {
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (width - w) / 2, y, size, font, color });
  };

  centerText("CERTIFICATE OF COMPLETION", height - 120, serif, 30, navy);
  centerText("This is to certify that", height - 170, serifRegular, 14, navy);
  centerText(studentName, height - 215, serif, 26, gold);
  centerText(`has successfully completed`, height - 255, serifRegular, 14, navy);
  centerText(courseName, height - 285, serif, 20, navy);
  centerText(`with a score of ${percent}%`, height - 320, serifRegular, 14, navy);
  centerText(dateStr, height - 380, serifRegular, 12, navy);
  centerText("wowtax.in  •  GST Certification Program", 60, serifRegular, 11, navy);

  const bytes = await doc.save();
  return bytes;
}

export function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
