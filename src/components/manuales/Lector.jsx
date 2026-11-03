import { useEffect, useState } from 'react'
import { FileDown, X } from '../shared/iconos'
import VistaDocumento from './VistaDocumento'
import { exportarDocumentoPDF } from '../../utils/documentoManualPDF'
import { exportarDocumentoWord } from '../../utils/documentoManualWord'

// Lectura de un documento escrito en la app, a pantalla completa (cómodo en el celular), con
// descarga en PDF y Word. `aprobadas` arma el control de cambios hasta esta versión.
export default function Lector({ manual, version, aprobadas, onCerrar }) {
  const [ocupado, setOcupado] = useState('')
  const [error, setError] = useState('')
  const anteriores = aprobadas.filter(v => v.version <= version.version)

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])

  const descargar = async formato => {
    setOcupado(formato); setError('')
    try {
      const datos = { manual, version, contenido: version.contenido, aprobadas: anteriores }
      if (formato === 'pdf') await exportarDocumentoPDF(datos); else await exportarDocumentoWord(datos)
    } catch (e) { setError(`No se pudo generar el archivo: ${e.message}`) }
    setOcupado('')
  }

  const boton = 'flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg border border-feisen-borde bg-white text-sm font-medium text-feisen-texto hover:bg-feisen-fondo disabled:opacity-50'
  return (
    <div role="dialog" aria-modal="true" aria-label={`Documento ${manual.titulo}`} className="!mt-0 fixed inset-0 z-50 bg-feisen-fondo flex flex-col">
      <div className="flex items-center gap-2 px-4 sm:px-6 h-14 bg-white border-b border-feisen-borde shrink-0">
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="p-2 -ml-2 rounded-lg text-feisen-texto-2 hover:bg-feisen-fondo"><X size={20} /></button>
        <p className="flex-1 min-w-0 text-sm font-semibold text-feisen-texto truncate">{manual.codigo} · v{version.version}</p>
        <button type="button" onClick={() => descargar('pdf')} disabled={!!ocupado} className={boton}><FileDown size={16} /> {ocupado === 'pdf' ? '…' : 'PDF'}</button>
        <button type="button" onClick={() => descargar('word')} disabled={!!ocupado} className={boton}><FileDown size={16} /> {ocupado === 'word' ? '…' : 'Word'}</button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-3 sm:px-6 py-5 pb-10 space-y-3">
          {error && <p className="text-sm text-feisen-rojo bg-feisen-rojo-suave rounded-lg px-3 py-2">{error}</p>}
          <VistaDocumento manual={manual} version={version} contenido={version.contenido} aprobadas={anteriores} />
        </div>
      </div>
    </div>
  )
}
