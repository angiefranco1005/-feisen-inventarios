import { X } from 'lucide-react'

export default function Modal({ titulo, onCerrar, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 px-0 sm:px-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <h3 className="font-semibold text-feisen-gris-oscuro text-lg">{titulo}</h3>
          <button onClick={onCerrar} className="text-feisen-gris-medio hover:text-feisen-gris-oscuro p-1">
            <X size={22} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  )
}
