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

# Check for required dependencies
REQUIRED_COMMANDS=("docker" "jq" "curl")
for cmd in "${REQUIRED_COMMANDS[@]}"; do
    if ! command -v "$cmd" &> /dev/null; then
        echo "Error: Required command '$cmd' is not installed or not in PATH" >&2
        exit 1
    fi
done

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

# Ensure we're using local Docker context and builder
echo -e "${BLUE}🔧 Ensuring local Docker setup...${NC}"
docker context use default 2>/dev/null || true
docker buildx use default 2>/dev/null || true

# Check if image exists locally
if ! docker image inspect "${IMAGE_NAME}" >/dev/null 2>&1; then
    echo -e "${RED}❌ Image ${IMAGE_NAME} not found locally${NC}"
    echo -e "${YELLOW}💡 Building image locally (SBOM will be generated with syft)...${NC}"
    
    # Simple local build without buildx complications
    docker build -t "${IMAGE_NAME}" .
else
    echo -e "${GREEN}✅ Image ${IMAGE_NAME} found locally${NC}"
fi

# Generate SBOM using syft (most reliable method for local development)
echo -e "${YELLOW}📋 Generating SBOM with syft...${NC}"
if command -v syft >/dev/null 2>&1; then
    syft "${IMAGE_NAME}" -o spdx-json > "${OUTPUT_DIR}/sbom_${TIMESTAMP}.spdx.json"
    echo -e "${GREEN}✅ SBOM generated with syft${NC}"
else
    echo -e "${YELLOW}📦 Installing syft locally for SBOM generation...${NC}"
    
    # Create local bin directory for syft
    mkdir -p ./bin
    
    # Download and install syft to local directory (Windows-compatible)
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" || "$OSTYPE" == "cygwin" ]]; then
        # Windows
        curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b ./bin
    else
        # Linux/Mac
        curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b ./bin
    fi
    
    # Use local syft binary
    ./bin/syft "${IMAGE_NAME}" -o spdx-json > "${OUTPUT_DIR}/sbom_${TIMESTAMP}.spdx.json"
    echo -e "${GREEN}✅ SBOM generated with local syft installation${NC}"
fi

# Skip provenance extraction to avoid buildx complications for local development
echo -e "${YELLOW}ℹ️  Skipping provenance extraction (not needed for local development)${NC}"
echo "null" > "${OUTPUT_DIR}/provenance_${TIMESTAMP}.json"

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
