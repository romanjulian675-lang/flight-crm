/**
 * Suggested playbooks for the default flight-school pipeline, one per stage, in the same order as
 * DEFAULT_STAGES in orgs.ts. Schools edit them in Settings → Pipeline. Plain text: shown as written.
 */
export type SuggestedPlaybook = { playbook: string; checklist: string[] };

export const SUGGESTED_PLAYBOOKS: Record<"en" | "es", SuggestedPlaybook[]> = {
  en: [
    {
      playbook: `Goal: talk to them within 5 minutes. Speed wins — the first school to call usually gets the student.

Opening: "Hi {name}, this is ___ from ___. You asked about flight training — is now a good time for 3 minutes?"

Find out:
• Why do they want to fly? (career, hobby, bucket list, gift)
• Any experience or hours already?
• When do they want to start?
• How do they plan to pay? (savings, loan, VA, employer)

If no answer: leave a short voicemail AND send a text right away. Try again the same day at a different time.`,
      checklist: ["Called within 5 minutes", "Texted if no answer", "Asked their goal (career / hobby)", "Asked about timeline and budget"],
    },
    {
      playbook: `Goal: book a discovery flight. It's the single best predictor of enrollment.

"The best way to know if flying is for you is to take the controls. Our discovery flight is about an hour, you'll fly the airplane yourself with an instructor. I have ___ or ___ open — which works better?"

Objections:
• "It's expensive" → The discovery flight is a small step; we'll walk you through the full cost and financing after you fly.
• "I need to think about it" → Totally fair. What would help you decide? Can I pencil you in and you can move it?
• "I'm not sure I have time" → Lessons fit around work — most of our students train 2–3 times a week.`,
      checklist: ["Explained what the discovery flight is", "Offered two specific times", "Booked the flight", "Sent confirmation + directions"],
    },
    {
      playbook: `Goal: make sure they show up ready.

The day before: text a reminder with the time, address, parking, and what to bring (photo ID, sunglasses, water). Tell them the instructor's name.

Ask: are they bringing anyone? Family members often help with the decision — invite them to watch.

Check the weather the morning of; if it's a no-go, reschedule on the same call.`,
      checklist: ["Reminder sent the day before", "Instructor assigned", "Weather checked", "Rescheduled if cancelled"],
    },
    {
      playbook: `Goal: turn excitement into a plan while it's fresh — talk the same day.

"How did that feel? What was your favorite part?"

Then walk through:
• The path for their goal (PPL → IR → CPL → CFI for career)
• Realistic timeline at their schedule
• Total cost estimate and payment options
• Medical certificate: they should book an AME exam now (it can take weeks and can block solo).

Close: "Would you like to get started? I can put together your training plan today."`,
      checklist: ["Debriefed the same day", "Explained the full path and timeline", "Gave a written cost estimate", "Told them to book a medical exam"],
    },
    {
      playbook: `Goal: remove the last blockers.

• Funding: help with loan applications (Stratus, Sallie Mae, AOPA Finance), VA eligibility (Part 141 programs), or a payment plan.
• Medical: confirm the AME appointment date. Any issue? Point them to an AME experienced with special issuances.
• International students: TSA Flight Training Security Program approval before training; I-20 if you're SEVP-certified.
• Paperwork: enrollment agreement, ID / proof of citizenship (TSA), student pilot certificate application in IACRA.

Follow up every 2–3 days — momentum matters.`,
      checklist: ["Funding confirmed", "Medical booked or done", "Citizenship / TSA verified", "Enrollment agreement signed", "First lesson scheduled"],
    },
    {
      playbook: `Welcome aboard! Hand them off to their instructor and schedule the first 2 weeks of lessons.

Ask for a referral: "Do you know anyone else who's always wanted to fly?"`,
      checklist: ["Introduced to instructor", "First two weeks scheduled", "Asked for a referral"],
    },
    {
      playbook: `Record why they didn't move forward — it tells you what to fix.

Not forever: many students come back after a few months (new job, saved money, after graduation). Set a follow-up for 60–90 days.`,
      checklist: ["Lost reason recorded", "Follow-up set for 60–90 days"],
    },
  ],
  es: [
    {
      playbook: `Meta: hablar con la persona en menos de 5 minutos. La rapidez gana — la primera escuela que llama suele quedarse con el estudiante.

Apertura: "Hola {nombre}, soy ___ de ___. Preguntaste por el entrenamiento de vuelo, ¿tienes 3 minutos?"

Averigua:
• ¿Por qué quiere volar? (carrera, pasatiempo, sueño, regalo)
• ¿Tiene experiencia u horas de vuelo?
• ¿Cuándo quiere empezar?
• ¿Cómo piensa pagar? (ahorros, préstamo, VA, empleador)

Si no contesta: deja un mensaje de voz corto Y envía un SMS de inmediato. Vuelve a intentar el mismo día a otra hora.`,
      checklist: ["Llamé en menos de 5 minutos", "Envié SMS si no contestó", "Pregunté su meta (carrera / pasatiempo)", "Pregunté fechas y presupuesto"],
    },
    {
      playbook: `Meta: agendar el vuelo de descubrimiento. Es el mejor indicador de que se inscribirá.

"La mejor forma de saber si volar es para ti es tomar los controles. El vuelo de descubrimiento dura como una hora y tú pilotas con un instructor. Tengo ___ o ___ disponible, ¿cuál te queda mejor?"

Objeciones:
• "Es caro" → El vuelo de descubrimiento es un paso pequeño; después te explicamos el costo total y el financiamiento.
• "Lo tengo que pensar" → Claro. ¿Qué te ayudaría a decidir? ¿Te aparto un horario y lo puedes mover?
• "No sé si tengo tiempo" → Las clases se acomodan a tu trabajo; la mayoría vuela 2–3 veces por semana.`,
      checklist: ["Expliqué el vuelo de descubrimiento", "Ofrecí dos horarios concretos", "Agendé el vuelo", "Envié confirmación y dirección"],
    },
    {
      playbook: `Meta: que llegue y llegue preparado.

Un día antes: envía recordatorio con hora, dirección, estacionamiento y qué traer (identificación, lentes de sol, agua). Dile el nombre del instructor.

Pregunta si viene con alguien: la familia suele influir en la decisión — invítalos a ver.

Revisa el clima esa mañana; si no se puede volar, reagenda en la misma llamada.`,
      checklist: ["Recordatorio enviado un día antes", "Instructor asignado", "Clima revisado", "Reagendado si se canceló"],
    },
    {
      playbook: `Meta: convertir la emoción en un plan mientras está fresca — habla el mismo día.

"¿Cómo te sentiste? ¿Qué fue lo que más te gustó?"

Luego explica:
• El camino según su meta (PPL → IR → CPL → CFI para carrera)
• Tiempo realista según su horario
• Costo total estimado y opciones de pago
• Certificado médico: que agende el examen con un AME ya (puede tardar semanas y frena el vuelo solo).

Cierre: "¿Te gustaría empezar? Hoy mismo te armo tu plan de entrenamiento."`,
      checklist: ["Conversé el mismo día", "Expliqué el camino completo y tiempos", "Di un estimado de costo por escrito", "Le dije que agende el examen médico"],
    },
    {
      playbook: `Meta: quitar los últimos obstáculos.

• Financiamiento: ayuda con préstamos (Stratus, Sallie Mae, AOPA Finance), elegibilidad VA (programas Parte 141) o plan de pagos.
• Médico: confirma la fecha con el AME. ¿Algún problema? Recomienda un AME con experiencia en casos especiales.
• Estudiantes internacionales: aprobación del programa de seguridad de la TSA antes de entrenar; I-20 si la escuela está certificada por SEVP.
• Documentos: contrato de inscripción, identificación / prueba de ciudadanía (TSA), solicitud del certificado de estudiante piloto en IACRA.

Da seguimiento cada 2–3 días — el impulso importa.`,
      checklist: ["Financiamiento confirmado", "Examen médico agendado o hecho", "Ciudadanía / TSA verificada", "Contrato firmado", "Primera clase agendada"],
    },
    {
      playbook: `¡Bienvenido! Preséntalo a su instructor y agenda las primeras 2 semanas de clases.

Pide un referido: "¿Conoces a alguien que siempre haya querido volar?"`,
      checklist: ["Presentado al instructor", "Primeras dos semanas agendadas", "Pedí un referido"],
    },
    {
      playbook: `Anota por qué no siguió — eso te dice qué mejorar.

No es para siempre: muchos regresan en unos meses (nuevo trabajo, ahorraron, se graduaron). Programa un seguimiento a 60–90 días.`,
      checklist: ["Motivo de pérdida anotado", "Seguimiento programado a 60–90 días"],
    },
  ],
};
