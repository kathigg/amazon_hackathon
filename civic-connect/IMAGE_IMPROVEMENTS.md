# Openverse Image Improvements

## Problems Fixed

### 1. ❌ Images Not Relevant to Bills
**Problem:** Images were based on bill titles with abbreviations (e.g., "VOICE Act") that don't describe what the bill actually does.

**Solution:** Now uses AI-generated summaries to extract key concepts and search for relevant images.

**Example:**
- **Before:** "VOICE Act" → searched for "voice" → got microphone images
- **After:** Uses summary "establish office for victims of immigration crimes" → gets relevant immigration/support images

### 2. ❌ Attribution Always Visible
**Problem:** Creator name, license, and title always displayed on image overlay, cluttering the visual.

**Solution:** Added `showAttribution` prop (default: `false`). Attribution is hidden from image overlay but still shown in text below (legally required).

### 3. ❌ Niche/Irrelevant Images
**Problem:** Keyword extraction from titles produced overly specific or irrelevant searches.

**Solution:** New priority system:
1. **AI Summary keywords** (highest priority - most relevant!)
2. **Issue-specific overrides** (curated queries for common topics)
3. **Topic tags** (general category fallbacks)
4. **Title keywords** (lowest priority - least reliable)

## How It Works Now

### Image Search Priority

```typescript
// Priority 1: Extract concepts from AI summary
"This bill would establish a new office for victims of immigration crimes"
→ "immigration victims support office"

// Priority 2: Check issue-specific overrides
If bill mentions "veteran" → "veterans standing in front of american flag"

// Priority 3: Use topic tags
If tagged "Healthcare" → "healthcare hospital medicine"

// Priority 4: Extract title keywords (fallback)
"Disabled Veterans Housing Support Act" → "disabled veterans housing support"
```

### Attribution Display

**Feed Cards & Homepage:**
- Clean image, no overlay text
- Attribution in separate text section below (legally required)

**Bill Detail Page:**
- Clean image, no overlay text
- Full attribution in text section: "Image: [title] · by [creator] · [license] · [source]"

## Usage

### For New Bills
Images will automatically use summaries when bills are first ingested.

### For Existing Bills
Run the regeneration script to update all existing bills:

```bash
npm run regenerate:images
```

This will:
- Find all bills with AI summaries
- Fetch new images using summary-based search
- Update database with better images
- Process in order of popularity (most viewed first)

### Manual Control

```tsx
// Hide attribution (default)
<BillIssueVisual
  billId={bill.id}
  title={bill.title}
  showAttribution={false}
/>

// Show attribution (if needed)
<BillIssueVisual
  billId={bill.id}
  title={bill.title}
  showAttribution={true}
/>
```

## Technical Changes

### Files Modified

1. **`lib/openverse.ts`**
   - Added `summary` parameter to `fetchBestOpenverseBillImage()`
   - New `extractKeywordsFromSummary()` function
   - Updated `buildOpenverseQueries()` to prioritize summary keywords

2. **`lib/getBillOrFetch.ts`**
   - Generate summary before fetching image
   - Pass summary to image fetch function
   - Retry image fetch if summary was generated later

3. **`components/BillIssueVisual.tsx`**
   - Added `showAttribution` prop (default: `false`)
   - Conditionally render attribution overlay
   - Cleaner visual appearance

4. **`app/bill/[id]/page.tsx`**
   - Set `showAttribution={false}` on detail page
   - Keep attribution in separate text section

### New Files

1. **`scripts/regenerate-images.ts`**
   - Batch regenerate images for existing bills
   - Uses AI summaries for better relevance
   - Rate-limited to be nice to Openverse API

2. **`IMAGE_IMPROVEMENTS.md`** (this file)
   - Documentation of changes and usage

## Examples

### Before & After

**Bill:** "VOICE Act" (Victims of Immigration Crime Engagement)

**Before:**
- Search query: "voice"
- Result: Microphone, singing, audio equipment
- Attribution: Cluttered overlay with creator/license

**After:**
- Search query: "immigration victims support office" (from summary)
- Result: Immigration support, border services, civic engagement
- Attribution: Clean image, details in text below

## Legal Compliance

Openverse requires attribution for Creative Commons images. We comply by:
- Displaying full attribution in text section below image
- Including: image title, creator, license, source
- Providing clickable link to original source
- Maintaining all metadata in database

The attribution is just hidden from the image overlay for better UX, but still fully visible and accessible.

## Future Improvements

- [ ] Add image quality scoring (prefer higher resolution)
- [ ] Cache popular searches to reduce API calls
- [ ] Add manual image override for specific bills
- [ ] Track which search queries produce best results
- [ ] A/B test different keyword extraction strategies
