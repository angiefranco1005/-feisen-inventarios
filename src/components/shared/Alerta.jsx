import { AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react'

const TIPOS = {
  error:   { icon: XCircle,       bg: 'bg-feisen-rojo-suave', border: 'border-red-200', text: 'text-feisen-rojo' },
  exito:   { icon: CheckCircle,   bg: 'bg-green-50',  border: 'border-green-200',   text: 'text-green-700' },
  alerta:  { icon: AlertTriangle, bg: 'bg-amber-50',  border: 'border-amber-200',   text: 'text-amber-700' },
  info:    { icon: Info,          bg: 'bg-feisen-azul-suave', border: 'border-blue-200', text: 'text-feisen-azul' },
}

export default function Alerta({ tipo = 'info', mensaje }) {
  if (!mensaje) return null
  const { icon: Icon, bg, border, text } = TIPOS[tipo]
  return (
    <div className={`flex items-start gap-3 ${bg} border ${border} rounded-lg px-4 py-3`}>
      <Icon size={18} className={`${text} flex-shrink-0 mt-0.5`} />
      <p className={`${text} text-sm`}>{mensaje}</p>
    </div>
  )
}
