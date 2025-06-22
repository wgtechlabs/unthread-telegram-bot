#!/bin/bash

# =============================================================================
# UNTHREAD TELEGRAM BOT - SBOM GENERATION SCRIPT
# =============================================================================
# This script generates Software Bill of Materials (SBOM) for the Docker image
# using LOCAL Docker builder only - designed for development and testing.
#
# Key Features:
#   - Forces use of local Docker builder (never cloud builders)
#   - No registry authentication required
#   - No remote pushes or pulls
#   - Perfect for contributors and development workflow
#   - Generates SBOM files locally for security analysis
#
# Requirements:
#   - Docker with BuildKit support
#   - docker buildx command
#   - jq (for JSON parsing and SBOM analysis)
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

echo -e "${BLUE}🔍 Generating SBOM locally for ${IMAGE_NAME}${NC}"

# Create output directory
mkdir -p "${OUTPUT_DIR}"

# Force use of local Docker builder (not cloud builder)
echo -e "${BLUE}🔧 Ensuring local Docker builder is used...${NC}"
docker buildx use default 2>/dev/null || docker buildx create --use --name local-builder --driver docker

# Check if image exists locally
if ! docker image inspect "${IMAGE_NAME}" >/dev/null 2>&1; then
    echo -e "${RED}❌ Image ${IMAGE_NAME} not found locally${NC}"
    echo -e "${YELLOW}💡 Building image with SBOM generation using LOCAL builder only...${NC}"
    
    # Build image with SBOM generation using LOCAL builder only
    docker buildx build \
        --builder local-builder \
        --sbom=true \
        --provenance=mode=max \
        --tag "${IMAGE_NAME}" \
        --metadata-file "${OUTPUT_DIR}/build_metadata_${TIMESTAMP}.json" \
        --load \
        .
else
    echo -e "${GREEN}✅ Image ${IMAGE_NAME} found locally${NC}"
fi

# Try to extract SBOM from existing image
echo -e "${YELLOW}📋 Attempting to extract SBOM from image...${NC}"
if docker buildx imagetools inspect "${IMAGE_NAME}" --format "{{ json .SBOM.SPDX }}" > "${OUTPUT_DIR}/sbom_${TIMESTAMP}.spdx.json" 2>/dev/null; then
    echo -e "${GREEN}✅ SBOM extracted successfully${NC}"
else
    echo -e "${YELLOW}⚠️  No embedded SBOM found. Generating with syft...${NC}"
    
    # Use syft as fallback to generate SBOM
    if command -v syft >/dev/null 2>&1; then
        syft "${IMAGE_NAME}" -o spdx-json > "${OUTPUT_DIR}/sbom_${TIMESTAMP}.spdx.json"
        echo -e "${GREEN}✅ SBOM generated with syft${NC}"
    else
        echo -e "${YELLOW}📦 Installing syft for SBOM generation...${NC}"
        # Install syft using the official installer
        curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b /usr/local/bin
        syft "${IMAGE_NAME}" -o spdx-json > "${OUTPUT_DIR}/sbom_${TIMESTAMP}.spdx.json"
        echo -e "${GREEN}✅ SBOM generated with syft${NC}"
    fi
fi

# Try to extract provenance (optional, won't fail if not available)
echo -e "${YELLOW}📋 Attempting to extract provenance attestations...${NC}"
if docker buildx imagetools inspect "${IMAGE_NAME}" --format "{{ json .Provenance }}" > "${OUTPUT_DIR}/provenance_${TIMESTAMP}.json" 2>/dev/null; then
    echo -e "${GREEN}✅ Provenance attestations extracted${NC}"
else
    echo -e "${YELLOW}⚠️  No provenance attestations found (this is normal for locally built images)${NC}"
    echo "null" > "${OUTPUT_DIR}/provenance_${TIMESTAMP}.json"
fi

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
- \`provenance_${TIMESTAMP}.json\` - Build provenance attestations (if available)
- \`build_metadata_${TIMESTAMP}.json\` - Build metadata (if available)

## Local Development & Testing

This SBOM was generated using the LOCAL Docker builder only:
- No cloud builders used
- No registry authentication required
- Perfect for development workflow
- Safe for contributors without cloud access

## Contributors

This script is designed for local development and testing. Contributors can:
1. Run this script without any cloud access or registry credentials
2. Generate SBOMs locally for security analysis
3. Test SBOM generation as part of the development workflow

No special permissions or authentication required!

## Dependencies Analysis

The SBOM includes information about:
- Base OS packages (Alpine Linux)
- Node.js runtime and modules
- npm/yarn dependencies
- System libraries and their versions

For detailed dependency information, see the SPDX JSON file.

## Security Scanning

You can use this SBOM with various security scanning tools:

\`\`\`bash
# Example with grype (vulnerability scanner)
grype sbom:${OUTPUT_DIR}/sbom_${TIMESTAMP}.spdx.json

# Example with trivy
trivy sbom ${OUTPUT_DIR}/sbom_${TIMESTAMP}.spdx.json
\`\`\`
EOF

# Display summary
echo -e "${GREEN}✅ Local SBOM generation completed!${NC}"
echo -e "${BLUE}📁 Files saved to: ${OUTPUT_DIR}/${NC}"
echo ""
echo "Generated files:"
ls -la "${OUTPUT_DIR}/"*"${TIMESTAMP}"* 2>/dev/null || echo "Checking files..."

echo ""
echo -e "${BLUE}🔍 Quick SBOM info:${NC}"
if [ -f "${OUTPUT_DIR}/sbom_${TIMESTAMP}.spdx.json" ]; then
    # Extract some basic info from SBOM
    PACKAGE_COUNT=$(jq -r '.packages | length // "Unable to count"' "${OUTPUT_DIR}/sbom_${TIMESTAMP}.spdx.json" 2>/dev/null || echo "Unable to parse")
    CREATOR=$(jq -r '.creationInfo.creators[0] // "Unknown"' "${OUTPUT_DIR}/sbom_${TIMESTAMP}.spdx.json" 2>/dev/null || echo "Unknown")
    
    echo "  📦 Packages: ${PACKAGE_COUNT}"
    echo "  🏗️  Creator: ${CREATOR}"
    
    # Show some top-level packages
    echo ""
    echo -e "${BLUE}📋 Sample packages found:${NC}"
    jq -r '.packages[0:5] | .[] | "  - \(.name) (\(.downloadLocation // "local"))"' "${OUTPUT_DIR}/sbom_${TIMESTAMP}.spdx.json" 2>/dev/null || echo "  (Package details in SBOM file)"
fi

echo ""
echo -e "${GREEN}🎉 SBOM generation complete!${NC}"
echo -e "${BLUE}💡 This SBOM was generated locally using the default Docker builder.${NC}"
echo -e "${BLUE}Perfect for development workflow - no cloud access required!${NC}"
