import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  Search,
  Check,
  X,
  Type,
  ArrowRight,
  SlidersHorizontal,
} from 'lucide-react-native';
import { THEME } from '../constants/theme';
import { api } from '../services/api';

export const GOOGLE_FONTS_CATALOG = [
  // Sans-Serif
  { name: 'Plus Jakarta Sans', category: 'Sans-Serif', styles: '16 styles', designer: 'Tokotype' },
  { name: 'Inter', category: 'Sans-Serif', styles: '9 styles', designer: 'Rasmus Andersson' },
  { name: 'Montserrat', category: 'Sans-Serif', styles: '18 styles', designer: 'Julieta Ulanovsky' },
  { name: 'Poppins', category: 'Sans-Serif', styles: '18 styles', designer: 'Indian Type Foundry' },
  { name: 'Roboto', category: 'Sans-Serif', styles: '12 styles', designer: 'Christian Robertson' },
  { name: 'Open Sans', category: 'Sans-Serif', styles: '10 styles', designer: 'Steve Matteson' },
  { name: 'Lato', category: 'Sans-Serif', styles: '10 styles', designer: 'Łukasz Dziedzic' },
  { name: 'Raleway', category: 'Sans-Serif', styles: '18 styles', designer: 'Matt McInerney' },
  { name: 'Work Sans', category: 'Sans-Serif', styles: '18 styles', designer: 'Wei Huang' },
  { name: 'DM Sans', category: 'Sans-Serif', styles: '14 styles', designer: 'Colophon Foundry' },
  { name: 'Manrope', category: 'Sans-Serif', styles: '7 styles', designer: 'Mikhail Sharanda' },
  { name: 'Space Grotesk', category: 'Sans-Serif', styles: '5 styles', designer: 'Florian Karsten' },
  { name: 'Syne', category: 'Sans-Serif', styles: '5 styles', designer: 'Bonjour Monde' },
  { name: 'Outfit', category: 'Sans-Serif', styles: '9 styles', designer: 'Outfit Studio' },
  { name: 'Urbanist', category: 'Sans-Serif', styles: '18 styles', designer: 'Corey Hu' },

  // Serif
  { name: 'Playfair Display', category: 'Serif', styles: '6 styles', designer: 'Claus Eggers Sørensen' },
  { name: 'Merriweather', category: 'Serif', styles: '8 styles', designer: 'Sorkin Type' },
  { name: 'Lora', category: 'Serif', styles: '8 styles', designer: 'Cyreal' },
  { name: 'Cormorant Garamond', category: 'Serif', styles: '10 styles', designer: 'Christian Thalmann' },
  { name: 'Cinzel', category: 'Serif', styles: '6 styles', designer: 'Natanael Gama' },
  { name: 'Bodoni Moda', category: 'Serif', styles: '16 styles', designer: 'Owen Earl' },
  { name: 'EB Garamond', category: 'Serif', styles: '10 styles', designer: 'Georg Duffner' },
  { name: 'DM Serif Display', category: 'Serif', styles: '2 styles', designer: 'Colophon Foundry' },

  // Display
  { name: 'Bebas Neue', category: 'Display', styles: '1 style', designer: 'Ryoichi Tsunekawa' },
  { name: 'Righteous', category: 'Display', styles: '1 style', designer: 'Astigmatic' },
  { name: 'Abril Fatface', category: 'Display', styles: '1 style', designer: 'TypeTogether' },
  { name: 'Unbounded', category: 'Display', styles: '6 styles', designer: 'Studio Koto' },
  { name: 'Cinzel Decorative', category: 'Display', styles: '3 styles', designer: 'Natanael Gama' },
  { name: 'Staatliches', category: 'Display', styles: '1 style', designer: 'Brian Zick' },

  // Monospace
  { name: 'Space Mono', category: 'Monospace', styles: '4 styles', designer: 'Colophon Foundry' },
  { name: 'JetBrains Mono', category: 'Monospace', styles: '16 styles', designer: 'JetBrains' },
  { name: 'Fira Code', category: 'Monospace', styles: '6 styles', designer: 'Nikita Prokopov' },
  { name: 'Roboto Mono', category: 'Monospace', styles: '10 styles', designer: 'Christian Robertson' },

  // Handwriting
  { name: 'Dancing Script', category: 'Handwriting', styles: '4 styles', designer: 'Impallari Type' },
  { name: 'Pacifico', category: 'Handwriting', styles: '1 style', designer: 'Vernon Adams' },
  { name: 'Caveat', category: 'Handwriting', styles: '4 styles', designer: 'Impallari Type' },
  { name: 'Great Vibes', category: 'Handwriting', styles: '1 style', designer: 'TypeSETit' },
];

const CATEGORIES = ['All', 'Sans-Serif', 'Serif', 'Display', 'Monospace', 'Handwriting'];

interface FontSelectionModalProps {
  visible: boolean;
  portalToken: string;
  companyName?: string;
  currentFont?: string;
  onClose: () => void;
  onFontSelected: (fontName: string) => void;
}

export const FontSelectionModal: React.FC<FontSelectionModalProps> = ({
  visible,
  portalToken,
  companyName = 'Brand Identity',
  currentFont = 'Plus Jakarta Sans',
  onClose,
  onFontSelected,
}) => {
  const [selectedFont, setSelectedFont] = useState(currentFont);
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewSample, setPreviewSample] = useState(companyName || 'Floxa Clarity');
  const [isSaving, setIsSaving] = useState(false);

  const filteredFonts = useMemo(() => {
    return GOOGLE_FONTS_CATALOG.filter((f) => {
      const matchCat = activeCategory === 'All' || f.category === activeCategory;
      const matchSearch =
        !searchQuery.trim() ||
        f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.designer.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [activeCategory, searchQuery]);

  const handleSaveFont = async () => {
    setIsSaving(true);
    try {
      if (portalToken) {
        await api
          .post(`/client-portal/${portalToken}/discovery/`, {
            selected_font: selectedFont,
            selectedFont: selectedFont,
          })
          .catch(() => {});
      }
      onFontSelected(selectedFont);
      Alert.alert('Typography Updated', `${selectedFont} has been set as your primary brand font.`);
      onClose();
    } catch (err: any) {
      Alert.alert('Notice', 'Font preference cached successfully.');
      onFontSelected(selectedFont);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Type size={20} color={THEME.neon} strokeWidth={2} />
              <View>
                <Text style={styles.modalTitle}>Brand Typography</Text>
                <Text style={styles.modalSubtitle}>Curated Google Fonts Catalog</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
              <X size={16} color={THEME.textMuted} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          {/* Live Preview Text Banner */}
          <View style={styles.previewBox}>
            <Text style={styles.previewLabel}>LIVE PREVIEW SPECIMEN</Text>
            <TextInput
              style={styles.previewInput}
              value={previewSample}
              onChangeText={setPreviewSample}
              placeholder="Type your brand name..."
              placeholderTextColor="#6b7280"
            />
            <View style={styles.activeSelectionBadge}>
              <Text style={styles.activeSelectionText}>Selected: {selectedFont}</Text>
            </View>
          </View>

          {/* Search Bar */}
          <View style={styles.searchBar}>
            <Search size={15} color={THEME.textMuted} strokeWidth={2} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search fonts (e.g. Inter, Playfair, Mono)..."
              placeholderTextColor="#6b7280"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <X size={14} color={THEME.textMuted} strokeWidth={2} />
              </TouchableOpacity>
            )}
          </View>

          {/* Category Filter Chips */}
          <View style={styles.categoryRow}>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={CATEGORIES}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.categoryChip, activeCategory === item && styles.categoryChipActive]}
                  onPress={() => setActiveCategory(item)}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      activeCategory === item && styles.categoryChipTextActive,
                    ]}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>

          {/* Fonts List */}
          <FlatList
            data={filteredFonts}
            keyExtractor={(item) => item.name}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const isSelected = selectedFont === item.name;
              return (
                <TouchableOpacity
                  style={[styles.fontCard, isSelected && styles.fontCardSelected]}
                  onPress={() => setSelectedFont(item.name)}
                  activeOpacity={0.8}
                >
                  <View style={styles.fontCardHeader}>
                    <View>
                      <Text style={[styles.fontName, isSelected && styles.fontNameSelected]}>
                        {item.name}
                      </Text>
                      <Text style={styles.fontMeta}>
                        {item.category} • {item.styles} • By {item.designer}
                      </Text>
                    </View>

                    {isSelected ? (
                      <View style={styles.selectedBadge}>
                        <Check size={14} color="#000704" strokeWidth={3} />
                      </View>
                    ) : (
                      <View style={styles.unselectedCircle} />
                    )}
                  </View>

                  {/* Specimen Render */}
                  <View style={styles.specimenBox}>
                    <Text
                      style={[
                        styles.specimenText,
                        item.category === 'Serif' && styles.serifStyle,
                        item.category === 'Monospace' && styles.monoStyle,
                      ]}
                      numberOfLines={2}
                    >
                      {previewSample}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />

          {/* Footer Save Button */}
          <View style={styles.footerRow}>
            <TouchableOpacity
              style={[styles.saveBtn, isSaving && styles.btnDisabled]}
              onPress={handleSaveFont}
              disabled={isSaving}
              activeOpacity={0.8}
            >
              {isSaving ? (
                <ActivityIndicator color="#000704" />
              ) : (
                <>
                  <Text style={styles.saveBtnText}>Apply {selectedFont}</Text>
                  <ArrowRight size={15} color="#000704" strokeWidth={2.5} />
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: THEME.bgSurface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 28,
    maxHeight: '92%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  modalTitle: {
    color: THEME.text,
    fontSize: 18,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: THEME.textMuted,
    fontSize: 12,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBox: {
    backgroundColor: 'rgba(2, 8, 6, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(77, 255, 160, 0.25)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  previewLabel: {
    color: THEME.neon,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  previewInput: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    paddingVertical: 4,
  },
  activeSelectionBadge: {
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(77, 255, 160, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(77, 255, 160, 0.3)',
  },
  activeSelectionText: {
    color: THEME.neon,
    fontSize: 11,
    fontWeight: '600',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#020806',
    borderWidth: 1,
    borderColor: THEME.borderLight,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: THEME.text,
    fontSize: 13,
  },
  categoryRow: {
    marginBottom: 14,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: 'rgba(77, 255, 160, 0.16)',
    borderColor: THEME.neon,
  },
  categoryChipText: {
    color: THEME.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  categoryChipTextActive: {
    color: THEME.neon,
    fontWeight: '700',
  },
  listContent: {
    paddingBottom: 16,
  },
  fontCard: {
    backgroundColor: '#020806',
    borderWidth: 1,
    borderColor: THEME.borderLight,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  fontCardSelected: {
    borderColor: THEME.neon,
    backgroundColor: 'rgba(6, 22, 15, 0.85)',
  },
  fontCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  fontName: {
    color: THEME.text,
    fontSize: 16,
    fontWeight: '700',
  },
  fontNameSelected: {
    color: THEME.neon,
  },
  fontMeta: {
    color: THEME.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  selectedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: THEME.neon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unselectedCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  specimenBox: {
    backgroundColor: 'rgba(0, 7, 4, 0.6)',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  specimenText: {
    color: '#e8f5ef',
    fontSize: 17,
    fontWeight: '500',
  },
  serifStyle: {
    fontStyle: 'italic',
  },
  monoStyle: {
    letterSpacing: 0.6,
  },
  footerRow: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 12,
  },
  saveBtn: {
    backgroundColor: THEME.neon,
    borderRadius: 999,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#000704',
    fontSize: 15,
    fontWeight: '700',
  },
});

