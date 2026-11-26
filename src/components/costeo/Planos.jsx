import { useEffect, useRef, useState } from 'react'
import { Download, FileText, Trash2, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatFecha } from '../../utils/formatters'

// Planos de una pieza / conjunto / máquina de costeo (Angie, 2026-11-26).
// Tabla costeo_ficha_planos + bucket privado `costeo-planos` (ruta `<ficha_id>/<uuid>-<nombre limpio>`).
// PDF e imágenes se abren en otra pestaña con URL firmada; DWG/DXF se descargan.
// Al subir o borrar se llama onCambio para refrescar el conteo del árbol (arbol.planos).

const BUCKET = 'costeo-planos'
const MAX_BYTES = 25 * 1024 * 1024
const EXT_PERMITIDAS = ['pdf', 'png', 'jpg', 'jpeg', 'dwg', 'dxf']
const EXT_DESCARGA = ['dwg', 'dxf']

const extension = (nombre) => (nombre.split('.').pop() || '').toLowerCase()
const esImagen = (p) => (p.tipo || '').startsWith('image/') || ['png', 'jpg', 'jpeg'].includes(extension(p.nombre))

function tamanoTexto(b) {
  if (!(b > 0)) return ''
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`
  return `${(b / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

// Ícono pequeño con el número de planos; no pinta nada si no hay.
export function IndicadorPlanos({ n }) {
  if (!(n > 0)) return null
  const texto = n === 1 ? '1 plano' : `${n} planos`
  return (
    <span title={texto} aria-label={texto} role="img" className="inline-flex items-center gap-0.5 shrink-0 align-middle text-xs font-normal tabular-nums text-feisen-texto-2">
      <FileText size={13} aria-hidden="true" />
      {n}
    </span>
  )
}

export default function Planos({ fichaId, onCambio }) {
  const { perfil } = useAuth()
  const [lista, setLista] = useState(null)
  const [miniaturas, setMiniaturas] = useState({})
  const [subiendo, setSubiendo] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  async function cargar() {
    const { data, error: e } = await supabase
      .from('costeo_ficha_planos')
      .select('*')
      .eq('ficha_id', fichaId)
      .order('created_at', { ascending: false })
    if (e) setError('No se pudieron cargar los planos: ' + e.message)
    const filas = data || []
    setLista(filas)
    const imagenes = filas.filter(esImagen)
    if (imagenes.length) {
      const { data: firmadas } = await supabase.storage.from(BUCKET).createSignedUrls(imagenes.map((p) => p.ruta), 3600)
      const mapa = {}
      for (const f of firmadas || []) if (f.signedUrl) mapa[f.path] = f.signedUrl
      setMiniaturas(mapa)
    } else setMiniaturas({})
  }

  useEffect(() => {
    setLista(null)
    setMiniaturas({})
    setError('')
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fichaId])

  async function subir(archivos) {
    if (!archivos.length || subiendo) return
    setError('')
    const errores = []
    let subidos = 0
    for (const [i, file] of archivos.entries()) {
      if (!EXT_PERMITIDAS.includes(extension(file.name))) {
        errores.push(`«${file.name}»: solo se aceptan PDF, PNG, JPG, DWG o DXF.`)
        continue
      }
      if (file.size > MAX_BYTES) {
        errores.push(`«${file.name}» pesa ${tamanoTexto(file.size)}; el máximo es 25 MB.`)
        continue
      }
      setSubiendo(archivos.length > 1 ? `Subiendo ${i + 1} de ${archivos.length}…` : 'Subiendo…')
      const limpio = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_')
      const ruta = `${fichaId}/${crypto.randomUUID()}-${limpio}`
      const { error: eSubida } = await supabase.storage.from(BUCKET).upload(ruta, file, { contentType: file.type || undefined })
      if (eSubida) {
        errores.push(`«${file.name}» no se pudo subir: ${eSubida.message}`)
        continue
      }
      const { error: eIns } = await supabase.from('costeo_ficha_planos').insert({
        ficha_id: fichaId, nombre: file.name, ruta, tipo: file.type || null, tamano: file.size, subido_nombre: perfil?.nombre || null,
      })
      if (eIns) {
        await supabase.storage.from(BUCKET).remove([ruta])
        errores.push(`«${file.name}» no se pudo guardar: ${eIns.message}`)
        continue
      }
      subidos++
    }
    setSubiendo('')
    if (errores.length) setError(errores.join(' '))
    if (subidos) {
      await cargar()
      onCambio?.()
    }
  }

  async function abrir(p) {
    setError('')
    const descarga = EXT_DESCARGA.includes(extension(p.nombre))
    // Se abre la pestaña antes del await para que el navegador no la bloquee
    const ventana = descarga ? null : window.open('', '_blank')
    const { data, error: e } = await supabase.storage.from(BUCKET).createSignedUrl(p.ruta, 300, descarga ? { download: p.nombre } : undefined)
    if (e || !data?.signedUrl) {
      ventana?.close()
      return setError('No se pudo abrir el plano: ' + (e?.message || 'sin enlace'))
    }
    if (ventana) ventana.location.href = data.signedUrl
    else window.location.href = data.signedUrl
  }

  async function borrar(p) {
    if (!window.confirm(`¿Borrar el plano «${p.nombre}»? No se puede deshacer.`)) return
    setError('')
    const { error: eSt } = await supabase.storage.from(BUCKET).remove([p.ruta])
    if (eSt) return setError('No se pudo borrar el archivo: ' + eSt.message)
    const { error: e } = await supabase.from('costeo_ficha_planos').delete().eq('id', p.id)
    if (e) return setError('No se pudo borrar: ' + e.message)
    await cargar()
    onCambio?.()
  }

  return (
    <div className="mt-7">
      <div className="flex items-center h-8">
        <h4 className="text-[11px] font-medium uppercase tracking-[0.06em] text-feisen-texto-2">Planos</h4>
        {lista?.length > 0 && <span className="ml-auto text-xs text-feisen-texto-2">{lista.length === 1 ? '1 archivo' : `${lista.length} archivos`}</span>}
      </div>

      {lista === null ? (
        <p className="text-sm text-feisen-texto-2 py-2">Cargando…</p>
      ) : lista.length ? (
        <ul className="divide-y divide-feisen-borde-suave">
          {lista.map((p) => {
            const descarga = EXT_DESCARGA.includes(extension(p.nombre))
            const mini = miniaturas[p.ruta]
            return (
              <li key={p.id} className="flex items-center gap-1 py-1.5">
                <button
                  type="button"
                  onClick={() => abrir(p)}
                  title={descarga ? 'Descargar' : 'Abrir en otra pestaña'}
                  className="flex-1 min-w-0 flex items-center gap-3 min-h-[48px] text-left rounded-lg px-2 -ml-2 hover:bg-feisen-fondo"
                >
                  {mini ? (
                    <img src={mini} alt="" className="w-10 h-10 shrink-0 rounded-md object-cover border border-feisen-borde-suave bg-feisen-fondo" />
                  ) : (
                    <span className="w-10 h-10 shrink-0 grid place-items-center rounded-md bg-feisen-fondo text-feisen-azul">
                      {descarga ? <Download size={16} /> : <FileText size={16} />}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block text-sm text-feisen-texto truncate">{p.nombre}</span>
                    <span className="block text-xs text-feisen-texto-2">
                      {formatFecha(p.created_at)}
                      {p.tamano ? ` · ${tamanoTexto(p.tamano)}` : ''}
                      {p.subido_nombre ? ` · ${p.subido_nombre}` : ''}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => borrar(p)}
                  title="Borrar"
                  aria-label={`Borrar plano ${p.nombre}`}
                  className="w-10 h-10 shrink-0 grid place-items-center rounded-lg text-feisen-texto-2 hover:bg-feisen-rojo-suave hover:text-feisen-rojo"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-feisen-texto-2 py-1">Sube aquí los planos de esta pieza (PDF, imagen, DWG o DXF).</p>
      )}

      <div className="mt-2">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.dwg,.dxf,application/pdf,image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const archivos = Array.from(e.target.files || [])
            e.target.value = ''
            subir(archivos)
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={!!subiendo}
          className="h-10 inline-flex items-center gap-1.5 rounded-lg border border-feisen-borde px-3 text-sm font-medium text-feisen-azul hover:bg-feisen-azul-suave disabled:opacity-50"
        >
          <Upload size={15} /> {subiendo || 'Subir plano'}
        </button>
        <p className="text-xs text-feisen-texto-2 mt-1">Máximo 25 MB por archivo.</p>
      </div>
      {error && <p className="text-sm text-feisen-rojo mt-2">{error}</p>}
    </div>
  )
}
