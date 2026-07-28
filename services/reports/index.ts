// services/reports/index.ts — öffentliche Fläche der Druck-Ausgaben-Infrastruktur.
// Heute nur die geteilte Hülle (BL-169); die konkreten Report-Builder (BL-170…) leben in
// ui/views/reports und importieren diese Hülle NACH UNTEN (INV-ARCH-1).
export { renderReport, esc, type ReportDoc } from './report-shell';
