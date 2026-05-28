export default function Spinner({ texto = 'Cargando...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <span className="animate-spin h-10 w-10 border-4 border-feisen-azul border-t-transparent rounded-full" />
      <p className="text-feisen-gris-medio text-sm">{texto}</p>
    </div>
  )
}
