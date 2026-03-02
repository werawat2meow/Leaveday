export type LeaveRequest = {
  id: string;
  empNo: string;
  name: string;
  org: string;
  dept: string;
  division: string;
  unit: string;
  leaveType: string;
  reason: string;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  levelP: string;
  status: "pending" | "approved" | "rejected";
  hrConfirmed?: boolean;
  approverName?: string;
};

function fmtDate(s: string) {
  if (!s) return "-";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

function buildFileBase(params: {
  showConfirmed: boolean;
  dateFrom?: string;
  dateTo?: string;
}) {
  const mode = params.showConfirmed ? "confirmed" : "waiting";
  const df = params.dateFrom || "all";
  const dt = params.dateTo || "all";

  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");

  return `HR_Confirm_Recheck_${mode}_${y}${m}${d}_${df}_to_${dt}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export async function exportHrConfirmToExcel(args: {
  rows: LeaveRequest[];
  showConfirmed: boolean;
  dateFrom?: string;
  dateTo?: string;
}) {
  const XLSX = await import("xlsx-js-style"); // <<< เปลี่ยนจาก "xlsx"
  const saveAs = (await import("file-saver")).default;

  const rows = args.rows.map((r, i) => ({
    ลำดับ: i + 1,
    รหัสพนักงาน: r.empNo ?? "",
    "ชื่อ-สกุล": r.name ?? "",
    สังกัด: r.org ?? "",
    แผนก: r.dept ?? "",
    ฝ่าย: r.division ?? "",
    หน่วย: r.unit ?? "",
    "Level P": r.levelP ?? "",
    ใช้สิทธิ์ลา: r.leaveType ?? "",
    วันที่ลาเริ่ม: fmtDate(r.from),
    วันที่ลาสิ้นสุด: fmtDate(r.to),
    เหตุผล: r.reason ?? "",
    ผู้อนุมัติ: r.approverName ?? "",
    HRยืนยันแล้ว: r.hrConfirmed ? "ใช่" : "ไม่ใช่",
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");

  // --- Style header row ---
  if (ws["!ref"]) {
    const range = XLSX.utils.decode_range(ws["!ref"]);

    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellAddr = XLSX.utils.encode_cell({ c: C, r: 0 });
      const cell = ws[cellAddr];
      if (cell) {
        cell.s = cell.s || {};
        cell.s.fill = {
          patternType: "solid",
          fgColor: { rgb: "FFFFEB9C" },
          bgColor: { rgb: "FFFFEB9C" },
        };
        cell.s.font = { bold: true };
        cell.s.alignment = { horizontal: "center", vertical: "center" };
      }
    }

    // --- Add thin border to every cell in used range ---
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const addr = XLSX.utils.encode_cell({ c: C, r: R });
        const cell = ws[addr];
        if (cell) {
          cell.s = cell.s || {};
          cell.s.border = {
            top: { style: "thin", color: { rgb: "FF000000" } },
            bottom: { style: "thin", color: { rgb: "FF000000" } },
            left: { style: "thin", color: { rgb: "FF000000" } },
            right: { style: "thin", color: { rgb: "FF000000" } },
          };
        }
      }
    }
  }

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array", cellStyles: true });
  saveAs(
    new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${buildFileBase(args)}.xlsx`
  );
}

export async function exportHrConfirmToPdf(args: {
  rows: LeaveRequest[];
  showConfirmed: boolean;
  dateFrom?: string;
  dateTo?: string;
}) {
  const jsPDFMod = await import("jspdf");
  const autoTableMod = await import("jspdf-autotable");
  const JsPDF = jsPDFMod.default;
  const autoTable = autoTableMod.default;

  const doc = new JsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  const fontFileName = "Sarabun-Regular.ttf";
  const fontName = "Sarabun";
  let thaiFontReady = false;

  // ถ้าต้องการฟอนต์ไทย ให้วางไฟล์ TTF (เช่น THSarabun.ttf) ไว้ใน /public/fonts
  // แล้วใช้ fetch เพื่อโหลดเป็น base64 แล้วเพิ่มเข้า jsPDF VFS
  try {
    const resp = await fetch(`/fonts/${fontFileName}`);
    if (resp.ok) {
      const buf = await resp.arrayBuffer();
      const b64 = arrayBufferToBase64(buf);
      doc.addFileToVFS(fontFileName, b64);
      // Identity-H helps with Unicode glyph mapping for TTF fonts
      try {
        (doc as any).addFont(fontFileName, fontName, "normal", "Identity-H");
      } catch {
        doc.addFont(fontFileName, fontName, "normal");
      }
      doc.setFont(fontName);
      thaiFontReady = true;
    }
  } catch (e) {
    // ถ้าโหลดฟอนต์ไม่สำเร็จ จะใช้ฟอนต์เริ่มต้น
  }

  // สร้าง head/body สำหรับ autotable
  const head = [[
    "No.",
    "EMP No.",
    "Name",
    "Org/Dept/Div/Unit",
    "Level P",
    "Leave Type",
    "From",
    "To",
    "Approver",
    "HR Confirmed",
  ]];

  const body = args.rows.map((r, i) => ([
    String(i + 1),
    r.empNo ?? "",
    r.name ?? "",
    `${r.org ?? ""}/${r.dept ?? ""}/${r.division ?? ""}/${r.unit ?? ""}`,
    r.levelP ?? "",
    r.leaveType ?? "",
    fmtDate(r.from),
    fmtDate(r.to),
    r.approverName ?? "",
    r.hrConfirmed ? "Yes" : "No",
  ]));

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 24;
  const tableWidth = pageWidth - marginX * 2;

  const sanitize = (value: unknown) => {
    if (value == null) return "";
    const s = String(value);
    return s
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .trim();
  };

  autoTable(doc, {
    head: head.map((row) => row.map(sanitize)),
    body: body.map((row) => row.map(sanitize)),
    startY: 40,
    theme: "grid", // แสดงเส้นตารางเต็ม
    tableWidth,
    margin: { left: marginX, right: marginX },
    headStyles: {
      fillColor: [17, 85, 204], // สีน้ำเงินหัวตาราง
      textColor: 255,
      halign: "center",
    },
    styles: {
      font: thaiFontReady ? fontName : undefined,
      fontSize: 8,
      cellPadding: 4,
      overflow: "linebreak",
      valign: "middle",
      cellWidth: "wrap",
    },
    columnStyles: {
      0: { cellWidth: 26, halign: "center" }, // No.
      1: { cellWidth: 55 }, // EMP No.
      4: { cellWidth: 55, halign: "center" }, // Level P
      6: { cellWidth: 60, halign: "center" }, // From
      7: { cellWidth: 60, halign: "center" }, // To
      9: { cellWidth: 70, halign: "center" }, // HR Confirmed
    },
    showHead: "everyPage",
  });

  // ส่งไฟล์ดาวน์โหลด
  const pdfName = `${buildFileBase(args)}.pdf`;
  const pdfBlob = doc.output("blob");
  const saveAs = (await import("file-saver")).default;
  saveAs(pdfBlob, pdfName);
}