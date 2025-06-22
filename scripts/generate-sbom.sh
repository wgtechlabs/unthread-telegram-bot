#!/bin/bash

# =============================================================================
# UNTHREAD TELEGRAM BOT - SBOM GENERATION SCRIPT
# =============================================================================
# This script generates Software Bill of Materials (SBOM) for the Docker image
# to enhance supply chain security and provide transparency about dependencies.
#
# Requirements:
#   - Docker with BuildKit support
#   - docker buildx command
#
# Usage:
#   ./scripts/generate-sbom.sh [image-name]
#
# Example:
#   ./scripts/generate-sbom.sh unthread-telegram-bot:latest
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
IMAGE_NAME="${1:-unthread-telegram-bot:latest}"
OUTPUT_DIR="./sbom"
TIMESTAMP=$(date -u +"%Y%m%d_%H%M%S")

echo -e "${BLUE}🔍 Generating SBOM for ${IMAGE_NAME}${NC}"

# Create output directory
mkdir -p "${OUTPUT_DIR}"

# Generate SBOM in multiple formats
echo -e "${YELLOW}📋 Generating SBOM in SPDX JSON format...${NC}"
docker buildx imagetools inspect "${IMAGE_NAME}" --format "{{ json .SBOM.SPDX }}" > "${OUTPUT_DIR}/sbom_${TIMESTAMP}.spdx.json" 2>/dev/null || {
    echo -e "${RED}❌ Failed to extract SBOM from image. Building with SBOM generation...${NC}"
    
    # Build image with SBOM generation
    echo -e "${YELLOW}🔨 Building image with SBOM generation...${NC}"
    docker build \
        --sbom=true \
        --provenance=mode=max \
        --tag "${IMAGE_NAME}" \
        --metadata-file "${OUTPUT_DIR}/build_metadata_${TIMESTAMP}.json" \
        .
    
    # Extract SBOM again
    docker buildx imagetools inspect "${IMAGE_NAME}" --format "{{ json .SBOM.SPDX }}" > "${OUTPUT_DIR}/sbom_${TIMESTAMP}.spdx.json"
}

# Generate attestations
echo -e "${YELLOW}📋 Extracting provenance attestations...${NC}"
docker buildx imagetools inspect "${IMAGE_NAME}" --format "{{ json .Provenance }}" > "${OUTPUT_DIR}/provenance_${TIMESTAMP}.json" 2>/dev/null || {
    echo -e "${YELLOW}⚠️  No provenance attestations found in image${NC}"
}

# Generate human-readable summary
echo -e "${YELLOW}📄 Creating human-readable SBOM summary...${NC}"
cat > "${OUTPUT_DIR}/sbom_summary_${TIMESTAMP}.md" << EOF
# Software Bill of Materials (SBOM) Summary

**Image:** \`${IMAGE_NAME}\`  
**Generated:** \`$(date -u)\`  
**Format:** SPDX 2.3 JSON

## Overview

This SBOM provides transparency into the software components and dependencies 
included in the Unthread Telegram Bot Docker image.

## Files Generated

- \`sbom_${TIMESTAMP}.spdx.json\` - Complete SBOM in SPDX JSON format
- \`provenance_${TIMESTAMP}.json\` - Build provenance attestations
- \`build_metadata_${TIMESTAMP}.json\` - Build metadata (if available)

## Verification

To verify the SBOM integrity:

\`\`\`bash
# Inspect the image attestations
docker buildx imagetools inspect ${IMAGE_NAME} --format "{{ json . }}"

# Verify SBOM signature (if signed)
cosign verify-attestation --type spdx ${IMAGE_NAME}
\`\`\`

## Dependencies

The SBOM includes information about:
- Base OS packages (Alpine Linux)
- Node.js runtime and modules
- npm/yarn dependencies
- System libraries

For detailed dependency information, see the SPDX JSON file.
EOF

# Display summary
echo -e "${GREEN}✅ SBOM generation completed!${NC}"
echo -e "${BLUE}📁 Files saved to: ${OUTPUT_DIR}/${NC}"
echo ""
echo "Generated files:"
ls -la "${OUTPUT_DIR}/"*"${TIMESTAMP}"*

echo ""
echo -e "${BLUE}🔍 Quick SBOM info:${NC}"
if [ -f "${OUTPUT_DIR}/sbom_${TIMESTAMP}.spdx.json" ]; then
    # Extract some basic info from SBOM
    PACKAGE_COUNT=$(jq -r '.packages | length' "${OUTPUT_DIR}/sbom_${TIMESTAMP}.spdx.json" 2>/dev/null || echo "Unable to parse")
    CREATOR=$(jq -r '.creationInfo.creators[0]' "${OUTPUT_DIR}/sbom_${TIMESTAMP}.spdx.json" 2>/dev/null || echo "Unknown")
    
    echo "  📦 Packages: ${PACKAGE_COUNT}"
    echo "  🏗️  Creator: ${CREATOR}"
fi

echo ""
echo -e "${GREEN}🎉 SBOM generation complete! Use these files for supply chain security analysis.${NC}"
