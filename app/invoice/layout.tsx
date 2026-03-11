export default function InvoiceLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="bg-white min-h-screen text-slate-900 font-sans selection:bg-blue-100 print:bg-white print:m-0 print:p-0">
            {children}
        </div>
    )
}
