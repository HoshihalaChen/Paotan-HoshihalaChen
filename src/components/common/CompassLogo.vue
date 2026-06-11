// 星芒罗盘 SVG logo - 极简细线风格
<template>
  <svg
    width="32" height="32"
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <!-- 外圈 -->
    <circle cx="32" cy="32" r="28" stroke="#C5C0BA" stroke-width="1.2" />
    <!-- 内圈 -->
    <circle cx="32" cy="32" r="22" stroke="#C5C0BA" stroke-width="0.8" />
    <!-- 中心点 -->
    <circle cx="32" cy="32" r="2" fill="#C5C0BA" />
    <!-- N/S/E/W 主方向线 -->
    <line x1="32" y1="4" x2="32" y2="16" stroke="#C5C0BA" stroke-width="0.8" />
    <line x1="32" y1="48" x2="32" y2="60" stroke="#C5C0BA" stroke-width="0.8" />
    <line x1="4" y1="32" x2="16" y2="32" stroke="#C5C0BA" stroke-width="0.8" />
    <line x1="48" y1="32" x2="60" y2="32" stroke="#C5C0BA" stroke-width="0.8" />
    <!-- 对角线 -->
    <line x1="12.2" y1="12.2" x2="20" y2="20" stroke="#C5C0BA" stroke-width="0.6" />
    <line x1="44" y1="20" x2="51.8" y2="12.2" stroke="#C5C0BA" stroke-width="0.6" />
    <line x1="12.2" y1="51.8" x2="20" y2="44" stroke="#C5C0BA" stroke-width="0.6" />
    <line x1="44" y1="44" x2="51.8" y2="51.8" stroke="#C5C0BA" stroke-width="0.6" />
    <!-- 星芒 -->
    <polygon
      points="32,8 33.5,14.5 32,16 30.5,14.5"
      fill="#C5C0BA" opacity="0.7"
    />
    <polygon
      points="56,32 49.5,33.5 48,32 49.5,30.5"
      fill="#C5C0BA" opacity="0.7"
    />
    <polygon
      points="32,56 30.5,49.5 32,48 33.5,49.5"
      fill="#C5C0BA" opacity="0.7"
    />
    <polygon
      points="8,32 14.5,30.5 16,32 14.5,33.5"
      fill="#C5C0BA" opacity="0.7"
    />
  </svg>
</template>
