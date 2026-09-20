import { Resend } from 'resend'

let _resend: Resend | null = null
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}

/**
 * Envía email de verificación con código a través de Resend
 * En desarrollo/testing sin dominio verificado, loguea el código en consola
 */
export async function sendVerificationEmail(
  email: string,
  code: string,
  firstName?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(
      `\n[auth] ========================================\n` +
      `[auth] ENVIANDO CÓDIGO DE VERIFICACIÓN\n` +
      `[auth] Email: ${email}\n` +
      `[auth] Código: ${code}\n` +
      `[auth] ========================================\n`
    )

    const isTestingMode = process.env.NODE_ENV !== 'production'

    if (isTestingMode) {
      console.warn(
        `[auth] [MODO DESARROLLO] El código ${code} fue guardado en BD pero NO se envió por email. ` +
        `Usa este código para testing.\n`
      )
      return { success: true }
    }

    const result = await getResend().emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'noreply@resend.dev',
      to: email,
      subject: 'Verifica tu correo',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="margin: 0; font-size: 28px; font-weight: bold;">Verificación de Email</h1>
          </div>

          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px;">
            <p style="font-size: 16px; color: #111827; margin: 0 0 20px 0;">
              Hola${firstName ? ' ' + firstName : ''},
            </p>

            <p style="font-size: 14px; color: #6b7280; margin: 0 0 30px 0; line-height: 1.6;">
              Para completar tu registro, verifica tu correo electrónico usando el código de 6 dígitos a continuación.
            </p>

            <div style="background: white; border: 2px solid #667eea; border-radius: 8px; padding: 30px; text-align: center; margin: 30px 0;">
              <p style="font-size: 12px; color: #9ca3af; margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 2px;">
                Código de Verificación
              </p>
              <p style="font-size: 42px; font-weight: bold; color: #667eea; margin: 0; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                ${code}
              </p>
            </div>

            <p style="font-size: 13px; color: #6b7280; margin: 0 0 20px 0; line-height: 1.6;">
              Este código expira en <strong>24 horas</strong>. Si no reconoces este registro, por favor ignora este correo.
            </p>
          </div>
        </div>
      `,
    })

    if (result.error) {
      if (result.error.message?.includes('domain is not verified')) {
        console.warn(
          `[auth] [DESARROLLO] Email no se envió por dominio no verificado en Resend.\n` +
          `[auth] Código guardado en BD: ${code}\n`
        )
        return { success: true }
      }
      console.error('[auth] Error sending email with Resend:', result.error)
      return { success: false, error: 'Error al enviar email de verificación' }
    }

    console.log(`[auth] ✓ Email enviado exitosamente. Email ID: ${result.data?.id}\n`)
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    if (process.env.NODE_ENV !== 'production' && errorMessage.includes('domain is not verified')) {
      console.warn(`[auth] [DESARROLLO] Email no se envió - dominio no verificado en Resend\n`)
      return { success: true }
    }

    console.error('[auth] Error in sendVerificationEmail:', error)
    return { success: false, error: 'Error al enviar email de verificación' }
  }
}
