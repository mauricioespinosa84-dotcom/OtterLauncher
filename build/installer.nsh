!macro customInstall
  MessageBox MB_YESNO|MB_ICONQUESTION "¿Deseas instalar el certificado de OTTER STUDIOS en este PC para evitar alertas de SmartScreen?" IDYES +2
  Goto done

  ; Instalar certificado para todos los usuarios (requiere admin)
  ExecWait '"$SYSDIR\certutil.exe" -addstore -f "Root" "$INSTDIR\resources\certs\otterstudios_codesign.cer"'
  ExecWait '"$SYSDIR\certutil.exe" -addstore -f "TrustedPublisher" "$INSTDIR\resources\certs\otterstudios_codesign.cer"'

done:
!macroend
