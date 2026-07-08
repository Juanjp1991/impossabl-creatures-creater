import React from "react";
import { Animal } from "./types";

export const ANIMALS: Animal[] = [
  {
    id: "bear",
    name: "Grizzly Bear",
    color: "#5C4033", // Dark Warm Brown
    accentColor: "#D2B48C", // Light Tan snout/ears
    description: "A slow but extremely strong, heavy, and bulky forest predator with a thick coat and massive shoulders.",
    bodyConnections: {
      neck: { x: 75, y: 95 },
      tail: { x: 265, y: 110 },
      legs: { x: 170, y: 165 },
    },
    parts: {
      head: {
        id: "bear-head",
        animalId: "bear",
        type: "head",
        name: "Bear Head",
        viewBox: "0 0 160 160",
        connections: {
          neck: { x: 120, y: 110 },
        },
        render: ({ color = "#5C4033", accentColor = "#D2B48C" }) => (
          <g id="svg-bear-head">
            <defs>
              <linearGradient id="bear-head-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#8B5A2B" />
                <stop offset="60%" stopColor={color} />
                <stop offset="100%" stopColor="#3D2B1F" />
              </linearGradient>
              <filter id="bear-fur-shadow" x="-10%" y="-10%" width="120%" height="120%">
                <feDropShadow dx="-2" dy="2" stdDeviation="2" floodOpacity="0.4" />
              </filter>
            </defs>
            {/* Outer Ear */}
            <path
              d="M 100,50 C 95,20 125,20 125,45 C 125,55 115,60 100,50 Z"
              fill="url(#bear-head-grad)"
              stroke="#3D2B1F"
              strokeWidth="2"
            />
            {/* Inner Ear */}
            <path
              d="M 104,47 C 102,30 120,30 120,44 C 120,50 112,53 104,47 Z"
              fill={accentColor}
            />
            
            {/* Head Base Shape */}
            <path
              d="M 120,110 
                 C 135,90 125,60 110,50 
                 C 95,40 75,45 65,55 
                 C 55,65 50,80 40,90 
                 C 30,95 25,100 28,108
                 C 30,115 45,115 55,115
                 C 65,125 80,128 95,124
                 C 110,120 115,115 120,110 Z"
              fill="url(#bear-head-grad)"
              stroke="#3D2B1F"
              strokeWidth="2"
            />

            {/* Fur detail lines */}
            <path d="M 115,65 C 105,75 110,85 100,90" fill="none" stroke="#3D2B1F" strokeWidth="1.5" opacity="0.4" />
            <path d="M 90,55 C 85,65 80,75 82,85" fill="none" stroke="#3D2B1F" strokeWidth="1.5" opacity="0.4" />
            
            {/* Snout Area */}
            <path
              d="M 52,85 
                 C 40,88 32,94 30,102 
                 C 28,109 38,114 48,114 
                 C 56,114 62,108 64,100 
                 C 65,92 58,85 52,85 Z"
              fill={accentColor}
              stroke="#3D2B1F"
              strokeWidth="1.5"
            />
            
            {/* Nose */}
            <path
              d="M 28,98 C 26,94 32,90 35,94 C 38,98 33,103 30,102 C 28,101 28,100 28,98 Z"
              fill="#1A110B"
            />
            
            {/* Mouth */}
            <path
              d="M 32,105 Q 40,108 46,104"
              fill="none"
              stroke="#3D2B1F"
              strokeWidth="2"
              strokeLinecap="round"
            />
            
            {/* Eye */}
            <circle cx="65" cy="78" r="5" fill="#1A110B" />
            <circle cx="63.5" cy="76.5" r="1.5" fill="#FFFFFF" />
            
            {/* Brow/shading */}
            <path d="M 58,72 Q 65,70 70,74" fill="none" stroke="#3D2B1F" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
          </g>
        ),
        rawContent: `<g>
  <!-- Bear Head -->
  <path d="M 100,50 C 95,20 125,20 125,45 C 125,55 115,60 100,50 Z" fill="#5C4033" stroke="#3D2B1F" strokeWidth="2" />
  <path d="M 104,47 C 102,30 120,30 120,44 C 120,50 112,53 104,47 Z" fill="#D2B48C" />
  <path d="M 120,110 C 135,90 125,60 110,50 C 95,40 75,45 65,55 C 55,65 50,80 40,90 C 30,95 25,100 28,108 C 30,115 45,115 55,115 C 65,125 80,128 95,124 C 110,120 115,115 120,110 Z" fill="#5C4033" stroke="#3D2B1F" strokeWidth="2" />
  <path d="M 52,85 C 40,88 32,94 30,102 C 28,109 38,114 48,114 C 56,114 62,108 64,100 C 65,92 58,85 52,85 Z" fill="#D2B48C" stroke="#3D2B1F" strokeWidth="1.5" />
  <path d="M 28,98 C 26,94 32,90 35,94 C 38,98 33,103 30,102 Z" fill="#1A110B" />
  <path d="M 32,105 Q 40,108 46,104" fill="none" stroke="#3D2B1F" strokeWidth="2" />
  <circle cx="65" cy="78" r="5" fill="#1A110B" />
  <circle cx="63.5" cy="76.5" r="1.5" fill="#FFFFFF" />
</g>`
      },
      body: {
        id: "bear-body",
        animalId: "bear",
        type: "body",
        name: "Bear Body",
        viewBox: "0 0 300 220",
        connections: {
          // Bodies don't have secondary attachments to themselves, but we track neck/tail/legs inside Animal bodyConnections
        },
        render: ({ color = "#5C4033" }) => (
          <g id="svg-bear-body">
            <defs>
              <linearGradient id="bear-body-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#7B5844" />
                <stop offset="40%" stopColor={color} />
                <stop offset="100%" stopColor="#302018" />
              </linearGradient>
            </defs>
            
            {/* Massive Hump & Body Torso */}
            <path
              d="M 75,95 
                 C 75,95 85,75 105,65 
                 C 125,55 150,45 185,50 
                 C 220,55 250,75 265,110 
                 C 280,140 270,170 240,180 
                 C 210,190 150,185 125,175 
                 C 100,165 75,145 75,120 
                 L 75,95 Z"
              fill="url(#bear-body-grad)"
              stroke="#3D2B1F"
              strokeWidth="2.5"
            />

            {/* Back shading layer for muscularity */}
            <path
              d="M 125,60 
                 C 145,55 175,55 200,65 
                 C 215,72 230,85 240,105 
                 C 220,115 190,110 160,115 
                 C 130,120 115,135 100,135 
                 C 100,105 110,75 125,60 Z"
              fill="#3D2B1F"
              opacity="0.3"
            />

            {/* Chest Highlight / Shading */}
            <path
              d="M 75,110 C 90,125 95,145 90,160 C 82,150 78,135 75,125 Z"
              fill="#8B5A2B"
              opacity="0.4"
            />

            {/* Fur detail tufts on the back and chest edges */}
            <path d="M 105,65 L 102,60 L 110,63" fill="none" stroke="#3D2B1F" strokeWidth="2" />
            <path d="M 150,50 L 148,43 L 155,47" fill="none" stroke="#3D2B1F" strokeWidth="2" />
            <path d="M 185,50 L 186,42 L 191,48" fill="none" stroke="#3D2B1F" strokeWidth="2" />
            <path d="M 245,95 L 250,91 L 248,98" fill="none" stroke="#3D2B1F" strokeWidth="2" />
            
            {/* Ribcage shading lines */}
            <path d="M 140,100 Q 150,125 145,150" fill="none" stroke="#3D2B1F" strokeWidth="1.5" opacity="0.3" />
            <path d="M 165,95 Q 175,125 170,150" fill="none" stroke="#3D2B1F" strokeWidth="1.5" opacity="0.3" />
            <path d="M 190,95 Q 200,125 195,145" fill="none" stroke="#3D2B1F" strokeWidth="1.5" opacity="0.3" />
          </g>
        ),
        rawContent: `<g>
  <!-- Bear Body -->
  <path d="M 75,95 C 75,95 85,75 105,65 C 125,55 150,45 185,50 C 220,55 250,75 265,110 C 280,140 270,170 240,180 C 210,190 150,185 125,175 C 100,165 75,145 75,120 L 75,95 Z" fill="#5C4033" stroke="#3D2B1F" strokeWidth="2.5" />
  <path d="M 125,60 C 145,55 175,55 200,65 C 215,72 230,85 240,105 C 220,115 190,110 160,115 C 130,120 115,135 100,135 C 100,105 110,75 125,60 Z" fill="#3D2B1F" opacity="0.3" />
  <path d="M 75,110 C 90,125 95,145 90,160 Z" fill="#8B5A2B" opacity="0.4" />
</g>`
      },
      legs: {
        id: "bear-legs",
        animalId: "bear",
        type: "legs",
        name: "Bear Legs",
        viewBox: "0 0 260 180",
        connections: {
          body: { x: 130, y: 15 },
        },
        render: ({ color = "#5C4033" }) => (
          <g id="svg-bear-legs">
            <defs>
              <linearGradient id="bear-leg-front-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={color} />
                <stop offset="100%" stopColor="#302018" />
              </linearGradient>
              <linearGradient id="bear-leg-back-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#3D2B1F" />
                <stop offset="100%" stopColor="#1A110B" />
              </linearGradient>
            </defs>

            {/* BACK LAYER LEGS (Darker for depth) */}
            {/* Back Front Leg */}
            <path
              d="M 55,20 
                 C 50,45 52,70 56,100 
                 C 59,120 54,135 48,150 
                 L 35,152 Q 35,160 48,160 
                 L 70,160 Q 75,145 73,125
                 C 70,100 72,70 75,35 Z"
              fill="url(#bear-leg-back-grad)"
              opacity="0.85"
            />
            {/* Back Claws (Front Leg) */}
            <path d="M 32,156 L 27,160 L 33,160 M 36,156 L 31,160 L 37,160 M 40,156 L 35,160 L 41,160" stroke="#111" strokeWidth="1.5" fill="#EAEAEA" opacity="0.8" />

            {/* Back Hind Leg */}
            <path
              d="M 180,20 
                 C 165,45 160,75 165,105 
                 C 168,125 164,140 160,152 
                 L 150,154 Q 150,162 165,162 
                 L 185,162 C 190,145 195,115 190,85
                 C 188,60 198,35 200,20 Z"
              fill="url(#bear-leg-back-grad)"
              opacity="0.85"
            />
            {/* Back Claws (Hind Leg) */}
            <path d="M 148,158 L 143,162 L 149,162 M 152,158 L 147,162 L 153,162 M 156,158 L 151,162 L 157,162" stroke="#111" strokeWidth="1.5" fill="#EAEAEA" opacity="0.8" />


            {/* FRONT LAYER LEGS (Main color) */}
            {/* Front Front Leg */}
            <path
              d="M 75,10 
                 C 68,35 66,60 72,90 
                 C 75,110 70,130 62,148 
                 L 48,150 
                 Q 48,159 62,159 
                 L 85,159 
                 Q 90,140 88,115
                 C 86,90 92,55 95,15 Z"
              fill="url(#bear-leg-front-grad)"
              stroke="#3D2B1F"
              strokeWidth="2"
            />
            {/* Front Claws (Front Leg) */}
            <path d="M 45,155 L 39,159 L 46,159 M 49,155 L 43,159 L 50,159 M 53,155 L 47,159 L 54,159" stroke="#3D2B1F" strokeWidth="1.5" fill="#EAEAEA" />

            {/* Front Hind Leg (Thicker, powerful thigh) */}
            <path
              d="M 210,10 
                 C 195,35 185,65 190,95 
                 C 193,115 188,135 180,150 
                 L 170,152 
                 Q 170,161 185,161 
                 L 210,161 
                 C 215,145 224,115 220,85
                 C 216,55 230,30 232,10 Z"
              fill="url(#bear-leg-front-grad)"
              stroke="#3D2B1F"
              strokeWidth="2"
            />
            {/* Front Claws (Hind Leg) */}
            <path d="M 166,157 L 160,161 L 167,161 M 170,157 L 164,161 L 171,161 M 174,157 L 168,161 L 175,161" stroke="#3D2B1F" strokeWidth="1.5" fill="#EAEAEA" />
            
            {/* Fur detail lines on joints */}
            <path d="M 80,45 Q 73,55 82,65" fill="none" stroke="#3D2B1F" strokeWidth="1.5" opacity="0.4" />
            <path d="M 205,40 Q 192,55 208,70" fill="none" stroke="#3D2B1F" strokeWidth="1.5" opacity="0.4" />
          </g>
        ),
        rawContent: `<g>
  <!-- Bear Legs (Front & Hind Layers) -->
  <path d="M 55,20 C 50,45 52,70 56,100 C 59,120 54,135 48,150 L 35,152 Q 35,160 48,160 L 70,160 Q 75,145 73,125 C 70,100 72,70 75,35 Z" fill="#3D2B1F" />
  <path d="M 180,20 C 165,45 160,75 165,105 C 168,125 164,140 160,152 L 150,154 Q 150,162 165,162 L 185,162 C 190,145 195,115 190,85 C 188,60 198,35 200,20 Z" fill="#3D2B1F" />
  <path d="M 75,10 C 68,35 66,60 72,90 C 75,110 70,130 62,148 L 48,150 Q 48,159 62,159 L 85,159 Q 90,140 88,115 C 86,90 92,55 95,15 Z" fill="#5C4033" stroke="#3D2B1F" strokeWidth="2" />
  <path d="M 210,10 C 195,35 185,65 190,95 C 193,115 188,135 180,150 L 170,152 Q 170,161 185,161 L 210,161 C 215,145 224,115 220,85 C 216,55 230,30 232,10 Z" fill="#5C4033" stroke="#3D2B1F" strokeWidth="2" />
</g>`
      },
      tail: {
        id: "bear-tail",
        animalId: "bear",
        type: "tail",
        name: "Bear Tail",
        viewBox: "0 0 60 60",
        connections: {
          body: { x: 10, y: 30 },
        },
        render: ({ color = "#5C4033" }) => (
          <g id="svg-bear-tail">
            {/* Small furry bear tail */}
            <path
              d="M 10,30 
                 C 5,20 15,5 30,8 
                 C 45,10 50,25 45,38 
                 C 40,48 25,50 15,45 
                 C 8,42 15,35 10,30 Z"
              fill={color}
              stroke="#3D2B1F"
              strokeWidth="2"
            />
            {/* Fur detail spike */}
            <path d="M 30,8 L 33,2" fill="none" stroke="#3D2B1F" strokeWidth="1.5" />
            <path d="M 45,25 Q 38,28 30,25" fill="none" stroke="#3D2B1F" strokeWidth="1.5" opacity="0.3" />
          </g>
        ),
        rawContent: `<g>
  <!-- Bear Tail -->
  <path d="M 10,30 C 5,20 15,5 30,8 C 45,10 50,25 45,38 C 40,48 25,50 15,45 C 8,42 15,35 10,30 Z" fill="#5C4033" stroke="#3D2B1F" strokeWidth="2" />
</g>`
      },
    },
  },
  {
    id: "cheetah",
    name: "Cheetah",
    color: "#F4C430", // Golden Cheetah Yellow
    accentColor: "#111111", // Spots/details color (Black)
    description: "An incredibly sleek, athletic, and fast desert cat with prominent spots, long running legs, and tear markings.",
    bodyConnections: {
      neck: { x: 50, y: 55 },
      tail: { x: 260, y: 75 },
      legs: { x: 150, y: 110 },
    },
    parts: {
      head: {
        id: "cheetah-head",
        animalId: "cheetah",
        type: "head",
        name: "Cheetah Head",
        viewBox: "0 0 140 140",
        connections: {
          neck: { x: 100, y: 100 },
        },
        render: ({ color = "#F4C430", accentColor = "#111111" }) => (
          <g id="svg-cheetah-head">
            <defs>
              <linearGradient id="cheetah-head-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFF2A3" />
                <stop offset="50%" stopColor={color} />
                <stop offset="100%" stopColor="#D4A017" />
              </linearGradient>
            </defs>
            
            {/* Small Rounded Ear */}
            <path
              d="M 80,45 C 75,25 100,20 102,40 C 104,48 95,52 80,45 Z"
              fill="url(#cheetah-head-grad)"
              stroke="#684A00"
              strokeWidth="1.5"
            />
            {/* Inner Ear */}
            <path
              d="M 84,43 C 81,31 96,28 97,39 Z"
              fill="#FAF0E6"
            />
            {/* Ear Tip Dark spot */}
            <path d="M 94,24 Q 100,26 98,32" fill="none" stroke={accentColor} strokeWidth="3" strokeLinecap="round" />

            {/* Cheetah Head Main Shape (facing left, sleek) */}
            <path
              d="M 100,100 
                 C 112,85 105,62 95,50 
                 C 85,40 70,42 60,50 
                 C 50,58 45,70 34,75 
                 C 25,78 22,83 25,89
                 C 28,95 42,95 50,95
                 C 58,105 72,108 85,106
                 C 95,104 98,102 100,100 Z"
              fill="url(#cheetah-head-grad)"
              stroke="#684A00"
              strokeWidth="2"
            />

            {/* White / Creamy Chin and Underneck */}
            <path
              d="M 28,89 C 32,94 45,95 50,95 C 55,102 65,105 75,104 C 65,100 50,88 45,88 C 36,88 32,89 28,89 Z"
              fill="#FAF0E6"
            />

            {/* Spots on forehead and back of head */}
            <circle cx="85" cy="58" r="2.5" fill={accentColor} />
            <circle cx="92" cy="64" r="2.5" fill={accentColor} />
            <circle cx="80" cy="65" r="2" fill={accentColor} />
            <circle cx="88" cy="74" r="3" fill={accentColor} />
            <circle cx="78" cy="76" r="2.5" fill={accentColor} />
            <circle cx="84" cy="85" r="3" fill={accentColor} />
            <circle cx="92" cy="84" r="2" fill={accentColor} />
            <circle cx="70" cy="56" r="2" fill={accentColor} />
            
            {/* Eye (Amber almond cat-eye) */}
            <path
              d="M 46,71 Q 54,64 58,72 Q 52,78 46,71 Z"
              fill="#FAF0E6"
              stroke="#332200"
              strokeWidth="1.5"
            />
            <circle cx="52" cy="71.5" r="3.5" fill="#E69A0B" />
            <circle cx="52" cy="71.5" r="1.5" fill="#111111" />
            <circle cx="50.5" cy="70" r="0.8" fill="#FFFFFF" />

            {/* Tear Line (Iconic cheetah marking) */}
            <path
              d="M 47,71 
                 Q 42,75 42,80 
                 Q 40,86 35,90"
              fill="none"
              stroke={accentColor}
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            {/* Muzzle and Nose */}
            <path
              d="M 23,80 C 22,78 26,74 29,76 C 32,78 30,83 25,83 C 24,83 23,81 23,80 Z"
              fill="#1A110B"
            />
            {/* Whiskers line details */}
            <circle cx="36" cy="83" r="0.7" fill={accentColor} />
            <circle cx="39" cy="84" r="0.7" fill={accentColor} />
            <circle cx="37" cy="86" r="0.7" fill={accentColor} />
            <circle cx="41" cy="87" r="0.7" fill={accentColor} />
          </g>
        ),
        rawContent: `<g>
  <!-- Cheetah Head -->
  <path d="M 80,45 C 75,25 100,20 102,40 C 104,48 95,52 80,45 Z" fill="#F4C430" stroke="#684A00" strokeWidth="1.5" />
  <path d="M 84,43 C 81,31 96,28 97,39 Z" fill="#FAF0E6" />
  <path d="M 100,100 C 112,85 105,62 95,50 C 85,40 70,42 60,50 C 50,58 45,70 34,75 C 25,78 22,83 25,89 C 28,95 42,95 50,95 C 58,105 72,108 85,106 C 95,104 98,102 100,100 Z" fill="#F4C430" stroke="#684A00" strokeWidth="2" />
  <path d="M 28,89 C 32,94 45,95 50,95 C 55,102 65,105 75,104 C 65,100 50,88 45,88 Z" fill="#FAF0E6" />
  <circle cx="85" cy="58" r="2.5" fill="#111111" />
  <circle cx="92" cy="64" r="2.5" fill="#111111" />
  <circle cx="88" cy="74" r="3" fill="#111111" />
  <path d="M 46,71 Q 54,64 58,72 Q 52,78 46,71 Z" fill="#FAF0E6" stroke="#332200" strokeWidth="1.5" />
  <circle cx="52" cy="71.5" r="3.5" fill="#E69A0B" />
  <circle cx="52" cy="71.5" r="1.5" fill="#111111" />
  <path d="M 47,71 Q 42,75 42,80 Q 40,86 35,90" fill="none" stroke="#111111" strokeWidth="2.5" strokeLinecap="round" />
</g>`
      },
      body: {
        id: "cheetah-body",
        animalId: "cheetah",
        type: "body",
        name: "Cheetah Body",
        viewBox: "0 0 300 180",
        connections: {},
        render: ({ color = "#F4C430", accentColor = "#111111" }) => (
          <g id="svg-cheetah-body">
            <defs>
              <linearGradient id="cheetah-body-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFF2A3" />
                <stop offset="50%" stopColor={color} />
                <stop offset="100%" stopColor="#D4A017" />
              </linearGradient>
            </defs>

            {/* Long Sleek Chest and Torso with Tucked Waist */}
            <path
              d="M 50,55 
                 C 55,50 68,48 85,48 
                 C 105,48 135,52 165,58 
                 C 195,64 225,65 245,68 
                 C 260,70 270,75 270,85 
                 C 270,105 250,115 235,115 
                 C 220,115 200,102 185,102
                 C 165,102 150,128 120,128 
                 C 90,128 75,115 65,105
                 C 50,90 50,70 50,55 Z"
              fill="url(#cheetah-body-grad)"
              stroke="#684A00"
              strokeWidth="2"
            />

            {/* Creamy white chest underbelly detail */}
            <path
              d="M 50,75 
                 C 52,90 65,105 75,110 
                 C 85,115 95,122 110,122 
                 C 105,112 90,100 85,95 
                 C 72,85 62,75 50,75 Z"
              fill="#FAF0E6"
              opacity="0.9"
            />
            {/* Tucked belly cream accent */}
            <path
              d="M 120,128 
                 C 135,128 150,118 165,110 
                 C 155,106 140,112 120,128 Z"
              fill="#FAF0E6"
              opacity="0.8"
            />

            {/* Muscular back details shading */}
            <path
              d="M 85,51 C 115,53 145,58 175,66 C 185,70 190,82 170,88 C 150,92 135,82 115,78 C 95,74 85,60 85,51 Z"
              fill="#D4A017"
              opacity="0.4"
            />
            <path
              d="M 215,72 C 235,74 250,78 255,88 C 245,95 230,95 220,90 Z"
              fill="#D4A017"
              opacity="0.4"
            />

            {/* Cheetah spots on the body (carefully distributed) */}
            <circle cx="80" cy="62" r="4" fill={accentColor} />
            <circle cx="95" cy="58" r="4.5" fill={accentColor} />
            <circle cx="112" cy="60" r="5" fill={accentColor} />
            <circle cx="130" cy="63" r="5" fill={accentColor} />
            <circle cx="148" cy="65" r="5" fill={accentColor} />
            <circle cx="168" cy="68" r="4.5" fill={accentColor} />
            <circle cx="186" cy="71" r="5" fill={accentColor} />
            <circle cx="204" cy="73" r="4.5" fill={accentColor} />
            <circle cx="222" cy="74" r="5" fill={accentColor} />
            <circle cx="240" cy="76" r="4" fill={accentColor} />
            <circle cx="254" cy="80" r="3.5" fill={accentColor} />
            
            {/* Lower row spots */}
            <circle cx="72" cy="84" r="4" fill={accentColor} />
            <circle cx="90" cy="80" r="5" fill={accentColor} />
            <circle cx="108" cy="81" r="5.5" fill={accentColor} />
            <circle cx="126" cy="84" r="5" fill={accentColor} />
            <circle cx="144" cy="86" r="4.5" fill={accentColor} />
            <circle cx="162" cy="88" r="5" fill={accentColor} />
            <circle cx="180" cy="88" r="4" fill={accentColor} />
            <circle cx="198" cy="90" r="5" fill={accentColor} />
            <circle cx="214" cy="91" r="5.5" fill={accentColor} />
            <circle cx="230" cy="92" r="4.5" fill={accentColor} />
            <circle cx="244" cy="95" r="3.5" fill={accentColor} />

            {/* Belly area spots (smaller) */}
            <circle cx="100" cy="102" r="3" fill={accentColor} />
            <circle cx="116" cy="104" r="3.5" fill={accentColor} />
            <circle cx="132" cy="106" r="3" fill={accentColor} />
            <circle cx="148" cy="103" r="2.5" fill={accentColor} />
            <circle cx="164" cy="99" r="3.5" fill={accentColor} />
            <circle cx="210" cy="105" r="4" fill={accentColor} />
            <circle cx="226" cy="106" r="3" fill={accentColor} />
            <circle cx="75" cy="98" r="3.5" fill={accentColor} />
          </g>
        ),
        rawContent: `<g>
  <!-- Cheetah Body -->
  <path d="M 50,55 C 55,50 68,48 85,48 C 105,48 135,52 165,58 C 195,64 225,65 245,68 C 260,70 270,75 270,85 C 270,105 250,115 235,115 C 220,115 200,102 185,102 C 165,102 150,128 120,128 C 90,128 75,115 65,105 C 50,90 50,70 50,55 Z" fill="#F4C430" stroke="#684A00" strokeWidth="2" />
  <path d="M 50,75 C 52,90 65,105 75,110 C 85,115 95,122 110,122 C 105,112 90,100 85,95 C 72,85 62,75 50,75 Z" fill="#FAF0E6" />
  <path d="M 120,128 C 135,128 150,118 165,110 Z" fill="#FAF0E6" />
  <circle cx="80" cy="62" r="4" fill="#111111" />
  <circle cx="95" cy="58" r="4.5" fill="#111111" />
  <circle cx="112" cy="60" r="5" fill="#111111" />
  <circle cx="130" cy="63" r="5" fill="#111111" />
  <circle cx="148" cy="65" r="5" fill="#111111" />
  <circle cx="168" cy="68" r="4.5" fill="#111111" />
  <circle cx="186" cy="71" r="5" fill="#111111" />
  <circle cx="204" cy="73" r="4.5" fill="#111111" />
  <circle cx="222" cy="74" r="5" fill="#111111" />
  <circle cx="240" cy="76" r="4" fill="#111111" />
  <circle cx="254" cy="80" r="3.5" fill="#111111" />
  <circle cx="72" cy="84" r="4" fill="#111111" />
  <circle cx="90" cy="80" r="5" fill="#111111" />
  <circle cx="108" cy="81" r="5.5" fill="#111111" />
  <circle cx="126" cy="84" r="5" fill="#111111" />
  <circle cx="144" cy="86" r="4.5" fill="#111111" />
  <circle cx="162" cy="88" r="5" fill="#111111" />
  <circle cx="180" cy="88" r="4" fill="#111111" />
  <circle cx="198" cy="90" r="5" fill="#111111" />
  <circle cx="214" cy="91" r="5.5" fill="#111111" />
  <circle cx="230" cy="92" r="4.5" fill="#111111" />
</g>`
      },
      legs: {
        id: "cheetah-legs",
        animalId: "cheetah",
        type: "legs",
        name: "Cheetah Legs",
        viewBox: "0 0 240 220",
        connections: {
          body: { x: 120, y: 15 },
        },
        render: ({ color = "#F4C430", accentColor = "#111111" }) => (
          <g id="svg-cheetah-legs">
            <defs>
              <linearGradient id="cheetah-leg-front-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={color} />
                <stop offset="100%" stopColor="#D4A017" />
              </linearGradient>
              <linearGradient id="cheetah-leg-back-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#C29010" />
                <stop offset="100%" stopColor="#8C6500" />
              </linearGradient>
            </defs>

            {/* BACK LAYER LEGS (Darker shade) */}
            {/* Back Front Leg */}
            <path
              d="M 50,20 
                 C 45,45 42,75 48,105 
                 C 52,125 45,155 38,185 
                 L 26,187 L 26,195 L 48,195 
                 C 53,175 58,145 56,115 
                 C 54,95 62,55 64,25 Z"
              fill="url(#cheetah-leg-back-grad)"
              opacity="0.85"
            />
            {/* Back Hind Leg (Athletic spring joint) */}
            <path
              d="M 160,20 
                 C 142,45 138,75 145,100 
                 C 152,120 148,145 140,170 
                 C 134,185 125,190 120,195 
                 L 142,195 
                 C 152,185 162,170 168,145 
                 C 174,120 178,85 174,50
                 C 172,35 174,25 175,20 Z"
              fill="url(#cheetah-leg-back-grad)"
              opacity="0.85"
            />
            {/* Spots on back legs */}
            <circle cx="48" cy="50" r="2.5" fill={accentColor} opacity="0.6" />
            <circle cx="52" cy="75" r="2.5" fill={accentColor} opacity="0.6" />
            <circle cx="50" cy="110" r="2" fill={accentColor} opacity="0.6" />
            <circle cx="44" cy="145" r="2" fill={accentColor} opacity="0.6" />
            <circle cx="162" cy="55" r="3" fill={accentColor} opacity="0.6" />
            <circle cx="155" cy="85" r="3" fill={accentColor} opacity="0.6" />
            <circle cx="156" cy="115" r="2.5" fill={accentColor} opacity="0.6" />
            <circle cx="148" cy="145" r="2" fill={accentColor} opacity="0.6" />


            {/* FRONT LAYER LEGS (Main color) */}
            {/* Front Front Leg */}
            <path
              d="M 68,12 
                 C 62,35 58,68 64,102 
                 C 68,125 60,155 52,192 
                 L 38,194 
                 Q 38,202 54,202 
                 L 72,202 
                 Q 78,185 78,155
                 C 78,125 82,90 84,40
                 C 85,25 88,15 88,12 Z"
              fill="url(#cheetah-leg-front-grad)"
              stroke="#684A00"
              strokeWidth="2"
            />
            {/* Spots on Front Front Leg */}
            <circle cx="75" cy="35" r="3" fill={accentColor} />
            <circle cx="70" cy="55" r="2.5" fill={accentColor} />
            <circle cx="76" cy="75" r="3" fill={accentColor} />
            <circle cx="72" cy="98" r="2.5" fill={accentColor} />
            <circle cx="70" cy="120" r="2" fill={accentColor} />
            <circle cx="64" cy="145" r="2" fill={accentColor} />
            <circle cx="58" cy="170" r="1.5" fill={accentColor} />

            {/* Front Hind Leg (S-shaped speed-running leg) */}
            <path
              d="M 188,12 
                 C 170,35 160,65 172,95 
                 C 182,118 178,142 165,168 
                 C 158,185 148,192 142,199 
                 Q 142,202 155,202 
                 L 172,202 
                 C 184,192 192,175 198,148 
                 C 204,118 208,82 202,48
                 C 198,32 202,20 204,12 Z"
              fill="url(#cheetah-leg-front-grad)"
              stroke="#684A00"
              strokeWidth="2"
            />
            {/* Spots on Front Hind Leg */}
            <circle cx="194" cy="32" r="3.5" fill={accentColor} />
            <circle cx="188" cy="48" r="4" fill={accentColor} />
            <circle cx="178" cy="65" r="3.5" fill={accentColor} />
            <circle cx="182" cy="85" r="4.5" fill={accentColor} />
            <circle cx="186" cy="108" r="3.5" fill={accentColor} />
            <circle cx="182" cy="130" r="3" fill={accentColor} />
            <circle cx="175" cy="152" r="2.5" fill={accentColor} />
            <circle cx="166" cy="175" r="2" fill={accentColor} />
            
            {/* Paws visual splits */}
            <path d="M 44,202 L 44,197 M 49,202 L 49,197" stroke="#684A00" strokeWidth="1.5" />
            <path d="M 148,202 L 148,197 M 153,202 L 153,197" stroke="#684A00" strokeWidth="1.5" />
          </g>
        ),
        rawContent: `<g>
  <!-- Cheetah Legs (Front & Hind Layers) -->
  <path d="M 50,20 C 45,45 42,75 48,105 C 52,125 45,155 38,185 L 26,187 L 26,195 L 48,195 C 53,175 58,145 56,115 C 54,95 62,55 64,25 Z" fill="#C29010" />
  <path d="M 160,20 C 142,45 138,75 145,100 C 152,120 148,145 140,170 C 134,185 125,190 120,195 L 142,195 C 152,185 162,170 168,145 C 174,120 178,85 174,50 Z" fill="#C29010" />
  <path d="M 68,12 C 62,35 58,68 64,102 C 68,125 60,155 52,192 L 38,194 Q 38,202 54,202 L 72,202 Q 78,185 78,155 C 78,125 82,90 84,40 Z" fill="#F4C430" stroke="#684A00" strokeWidth="2" />
  <path d="M 188,12 C 170,35 160,65 172,95 C 182,118 178,142 165,168 C 158,185 148,192 142,199 Q 142,202 155,202 L 172,202 C 184,192 192,175 198,148 C 204,118 208,82 202,48 Z" fill="#F4C430" stroke="#684A00" strokeWidth="2" />
</g>`
      },
      tail: {
        id: "cheetah-tail",
        animalId: "cheetah",
        type: "tail",
        name: "Cheetah Tail",
        viewBox: "0 0 160 160",
        connections: {
          body: { x: 15, y: 15 },
        },
        render: ({ color = "#F4C430", accentColor = "#111111" }) => (
          <g id="svg-cheetah-tail">
            <defs>
              <linearGradient id="cheetah-tail-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={color} />
                <stop offset="100%" stopColor="#D4A017" />
              </linearGradient>
            </defs>
            {/* Long elegant cheetah tail, curling up */}
            <path
              d="M 15,15 
                 C 40,25 65,45 80,68 
                 C 95,90 105,115 125,120 
                 C 138,122 145,110 142,95 
                 C 139,80 120,70 115,85 
                 C 112,95 118,105 124,105 
                 C 112,105 102,85 90,65 
                 C 78,45 50,22 15,10 Z"
              fill="url(#cheetah-tail-grad)"
              stroke="#684A00"
              strokeWidth="1.5"
            />
            
            {/* Creamy white underside tail tip */}
            <path
              d="M 125,120 Q 138,122 142,95 C 139,85 125,82 125,98 Q 125,110 125,120 Z"
              fill="#FAF0E6"
              opacity="0.9"
            />

            {/* Black spots and tip rings */}
            <circle cx="30" cy="22" r="3" fill={accentColor} />
            <circle cx="45" cy="30" r="3.5" fill={accentColor} />
            <circle cx="60" cy="42" r="4" fill={accentColor} />
            <circle cx="72" cy="55" r="4" fill={accentColor} />
            <circle cx="82" cy="70" r="4.5" fill={accentColor} />
            <circle cx="92" cy="85" r="4" fill={accentColor} />
            <circle cx="102" cy="98" r="3.5" fill={accentColor} />
            <circle cx="115" cy="110" r="3.5" fill={accentColor} />

            {/* Black rings near tail tip */}
            <path d="M 125,113 Q 130,111 133,114" stroke={accentColor} strokeWidth="3" fill="none" />
            <path d="M 131,104 Q 135,101 138,105" stroke={accentColor} strokeWidth="3" fill="none" />
            <path d="M 136,94 Q 140,92 141,96" stroke={accentColor} strokeWidth="4" fill="none" />
          </g>
        ),
        rawContent: `<g>
  <!-- Cheetah Tail -->
  <path d="M 15,15 C 40,25 65,45 80,68 C 95,90 105,115 125,120 C 138,122 145,110 142,95 C 139,80 120,70 115,85 C 112,95 118,105 124,105 C 112,105 102,85 90,65 C 78,45 50,22 15,10 Z" fill="#F4C430" stroke="#684A00" strokeWidth="1.5" />
  <path d="M 125,120 Q 138,122 142,95 C 139,85 125,82 125,98 Q 125,110 125,120 Z" fill="#FAF0E6" />
  <circle cx="30" cy="22" r="3" fill="#111111" />
  <circle cx="45" cy="30" r="3.5" fill="#111111" />
  <circle cx="60" cy="42" r="4" fill="#111111" />
</g>`
      },
    },
  },
];
