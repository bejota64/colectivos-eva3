/**
 * Ilustraciones propias en SVG (sin imagenes externas): pesan poco, se ven
 * nitidas en cualquier pantalla y no necesitan permisos de uso.
 */

/** Colectivo de perfil: sedan negro con el letrero amarillo en el techo. */
export function IlustracionColectivo({ codigo = '9001', className }: { codigo?: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 360 170" role="img" aria-label={`Colectivo de la linea ${codigo}`}>
      <ellipse cx="180" cy="154" rx="156" ry="7" fill="#000" opacity="0.28" />
      {/* Letrero sobre el techo */}
      <rect x="152" y="46" width="4" height="7" fill="#111" />
      <rect x="204" y="46" width="4" height="7" fill="#111" />
      <rect x="138" y="20" width="84" height="28" rx="3" fill="#ffc72c" stroke="#000" strokeWidth="2.5" />
      <text
        x="180"
        y="40.5"
        textAnchor="middle"
        fontFamily="'Barlow Condensed', sans-serif"
        fontWeight="700"
        fontSize="20"
        letterSpacing="1"
        fill="#000"
      >
        {codigo}
      </text>
      {/* Carroceria */}
      <path
        d="M24 130 L22 107 Q22 95 36 93 L94 88 L130 59 Q136 53 146 52 L214 51 Q224 51 231 57 L265 87 L326 95 Q339 97 340 109 L339 130 L310 130 A28 28 0 0 0 254 130 L116 130 A28 28 0 0 0 60 130 Z"
        fill="#1f2023"
      />
      <path d="M30 98 L332 101" stroke="#45484f" strokeWidth="2" />
      {/* Ventanas */}
      <path d="M104 87 L134 63 Q137 60 141 60 L168 60 L168 87 Z" fill="#5a5e66" />
      <path d="M176 60 L216 60 Q221 60 225 63 L251 87 L176 87 Z" fill="#5a5e66" />
      <path d="M146 60 L160 60 L126 87 L114 87 Z" fill="#fff" opacity="0.12" />
      <path d="M196 60 L206 60 L182 87 L174 87 Z" fill="#fff" opacity="0.1" />
      {/* Puertas y manillas */}
      <path d="M172 90 L172 128 M100 92 L100 126 M246 91 L250 126" stroke="#000" strokeWidth="1.5" opacity="0.55" />
      <rect x="148" y="104" width="14" height="3.5" rx="1.75" fill="#45484f" />
      <rect x="220" y="104" width="14" height="3.5" rx="1.75" fill="#45484f" />
      {/* Luces */}
      <path d="M326 101 L338 103 L338 110 L327 108 Z" fill="#fff3cc" />
      <path d="M23 100 L31 99 L31 108 L23 109 Z" fill="#c0262d" />
      {/* Ruedas */}
      <circle cx="88" cy="132" r="23" fill="#111" />
      <circle cx="88" cy="132" r="11" fill="#8a8f98" />
      <circle cx="88" cy="132" r="4" fill="#45484f" />
      <circle cx="282" cy="132" r="23" fill="#111" />
      <circle cx="282" cy="132" r="11" fill="#8a8f98" />
      <circle cx="282" cy="132" r="4" fill="#45484f" />
    </svg>
  );
}

/** Silueta de la cordillera, el fondo de Puente Alto. Decorativa. */
export function Cordillera({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 1200 260" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <path
        d="M0 260 L0 170 L90 128 L150 146 L240 82 L310 120 L392 60 L470 112 L548 76 L626 132 L712 52 L800 104 L880 80 L968 134 L1048 92 L1126 122 L1200 100 L1200 260 Z"
        fill="#2c2e33"
      />
      <path
        d="M240 82 L262 96 L250 98 L232 90 Z M392 60 L418 78 L402 80 L386 72 L376 70 Z M712 52 L738 70 L722 72 L706 64 L694 66 Z M548 76 L566 88 L548 90 L536 86 Z M1048 92 L1066 104 L1050 106 L1036 100 Z"
        fill="#5d6169"
      />
      <path
        d="M0 260 L0 214 L120 190 L260 206 L410 176 L560 200 L700 184 L860 206 L1010 188 L1200 204 L1200 260 Z"
        fill="#26282c"
      />
    </svg>
  );
}
