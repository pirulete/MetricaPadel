declare module 'swagger-ui-react' {
  import { ComponentType } from 'react'

  interface SwaggerUIProps {
    url?: string
    spec?: Record<string, unknown>
    docExpansion?: 'list' | 'full' | 'none'
    defaultModelsExpandDepth?: number
    defaultModelExpandDepth?: number
    filter?: boolean | string
    showExtensions?: boolean
    showCommonExtensions?: boolean
    tryItOutEnabled?: boolean
    supportedSubmitMethods?: string[]
    layout?: string
    plugins?: unknown[]
    presets?: unknown[]
  }

  const SwaggerUI: ComponentType<SwaggerUIProps>
  export default SwaggerUI
}
