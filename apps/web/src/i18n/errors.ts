const spanishErrors: Record<string, string> = {
  'Email or password is incorrect': 'El correo o la contraseña son incorrectos',
  'Invalid clinic access code': 'El código de acceso de la clínica no es válido',
  'Please sign in': 'Inicia sesión para continuar',
  'Your session has expired. Please sign in again': 'Tu sesión ha caducado. Inicia sesión de nuevo',
  'An account with that email already exists': 'Ya existe una cuenta con ese correo',
  'Veterinarian access required': 'Se requiere acceso de veterinario',
  'Owner access required': 'Se requiere acceso de dueño',
  'Record not found': 'No se encontró el registro',
  'Choose a future time': 'Elige una hora futura',
  'Choose a slot within clinic opening hours': 'Elige una hora dentro del horario de apertura',
  'This slot is full. Please choose another time': 'Este horario está completo. Elige otra hora',
  'This time overlaps a clinic block': 'Este horario se solapa con un bloqueo de la clínica',
  'This veterinarian already has an overlapping appointment':
    'Este veterinario ya tiene una cita que se solapa',
  'A block cannot overlap an existing appointment':
    'Un bloqueo no puede solaparse con una cita existente',
  'A weekly block cannot overlap an upcoming appointment':
    'Un bloqueo semanal no puede solaparse con una cita próxima',
  'Stock cannot become negative': 'Las existencias no pueden ser negativas',
  'Case checkpoints are managed by the clinic': 'La clínica gestiona las etapas de los casos',
  'Checkpoints without the pet must be scheduled by a veterinarian':
    'Un veterinario debe programar las etapas que no necesitan a la mascota',
  'This appointment can no longer be cancelled': 'Esta cita ya no se puede cancelar',
  'Pets with care history cannot be deleted': 'No se pueden eliminar mascotas con historial',
  'Used visit types can be retired but never deleted':
    'Los tipos utilizados se pueden retirar, pero nunca eliminar',
  'Email delivery is not configured for this clinic.':
    'El servicio de correo no está configurado para esta clínica.',
  'Something went wrong. Please try again.': 'Ocurrió un error. Inténtalo de nuevo.',
  'A visit cannot be completed before its start time':
    'Una visita no se puede completar antes de su hora de inicio',
  'Save and review the visit plan before completing the visit':
    'Guarda y revisa el plan antes de completar la visita',
  'This appointment changed. Refresh and try again':
    'La cita cambió. Cierra el formulario y ábrelo de nuevo',
  'Choose an active visit type': 'Elige un tipo de visita activo',
  'This visit type must list the materials it uses':
    'Este tipo de visita debe indicar los materiales que utiliza',
  'Invalid JSON request': 'La solicitud JSON no es válida',
  'Request is too large': 'La solicitud es demasiado grande',
  'The clinic server is unavailable. Please try again.':
    'El servidor de la clínica no está disponible. Inténtalo de nuevo.',
  'Enter a date of birth or approximate age': 'Introduce una fecha de nacimiento o edad aproximada',
  'Date of birth must be a real date in the past':
    'La fecha de nacimiento debe ser una fecha real del pasado',
  'Corrections require a reason': 'Las correcciones necesitan un motivo',
  'Received quantity must be positive': 'La cantidad recibida debe ser positiva',
  'Quantity cannot be zero': 'La cantidad no puede ser cero',
  'List each product only once': 'Incluye cada producto una sola vez',
  'End must be after start': 'El final debe ser posterior al inicio',
};
export function localizeError(message: string): string {
  if (typeof document === 'undefined' || document.documentElement.lang !== 'es') return message;
  let translated = message;
  for (const [english, spanish] of Object.entries(spanishErrors))
    translated = translated.replace(english, spanish);
  return translated;
}
