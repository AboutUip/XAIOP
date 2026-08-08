package types

// TypeFreezeSession observes commit trees and freezes allow-typed leaf shapes.
type TypeFreezeSession struct {
	schema       *TypeRegistry
	freeze       map[string]map[string]any
	escapePaths  []string
	onViolation  func(*TypeError)
}

// NewTypeFreezeSession creates a freeze session with optional schema.
func NewTypeFreezeSession(schema any, onViolation func(*TypeError)) (*TypeFreezeSession, error) {
	s := &TypeFreezeSession{
		freeze:      map[string]map[string]any{},
		onViolation: onViolation,
	}
	if schema != nil {
		if err := s.ApplySchema(schema); err != nil {
			return nil, err
		}
	}
	return s, nil
}

// ApplySchema installs or clears the schema registry.
func (s *TypeFreezeSession) ApplySchema(schema any) error {
	if schema == nil {
		s.schema = nil
		return nil
	}
	reg, err := FromSnapshot(schema)
	if err != nil {
		return err
	}
	s.schema = reg
	for _, e := range reg.List() {
		if e.Polarity == PolarityAllow && e.Type["kind"] != KindAny {
			if _, ok := s.freeze[e.Path]; !ok {
				s.freeze[e.Path] = StripShape(e.Type)
			}
		}
	}
	return nil
}

// Schema returns the active registry (may be nil).
func (s *TypeFreezeSession) Schema() *TypeRegistry { return s.schema }

// Freezes returns the current freeze map (live view).
func (s *TypeFreezeSession) Freezes() map[string]map[string]any { return s.freeze }

// ClearPath removes freeze entries under path prefix.
func (s *TypeFreezeSession) ClearPath(path string) {
	prefix, err := normalizeRegistryPath(path)
	if err != nil {
		prefix = path
	}
	for key := range s.freeze {
		if key == prefix || hasPathPrefix(key, prefix) {
			delete(s.freeze, key)
		}
	}
}

func hasPathPrefix(key, prefix string) bool {
	if prefix == "" {
		return true
	}
	if len(key) <= len(prefix) {
		return false
	}
	if key[:len(prefix)] != prefix {
		return false
	}
	c := key[len(prefix)]
	return c == '.' || c == '['
}

// ObserveTree freezes shapes from tree; optionally throws on schema mismatch.
func (s *TypeFreezeSession) ObserveTree(tree any, throw bool, escapePaths []string) ([]*TypeError, error) {
	var errors []*TypeError
	s.escapePaths = append([]string(nil), escapePaths...)
	defer func() { s.escapePaths = nil }()
	if tree == nil {
		return errors, nil
	}
	root := unwrapFragment(tree)
	s.walkObserve(root, nil, &errors)
	if throw && len(errors) > 0 {
		return errors, errors[0]
	}
	return errors, nil
}

func (s *TypeFreezeSession) walkObserve(value any, segs []any, errors *[]*TypeError) {
	if len(segs) > 0 {
		path := formatJSONPath(segs)
		if !pathEscapes(path, s.escapePaths) {
			if classified, err := ClassifyValue(value); err == nil {
				leaf := StripShape(classified)
				if prev, ok := s.freeze[path]; ok {
					if !TypeCompatible(prev, leaf) {
						te := &TypeError{
							Message:  "freeze mismatch at " + path,
							Path:     path,
							Expected: prev,
							Actual:   leaf,
						}
						if s.onViolation != nil {
							s.onViolation(te)
						}
						*errors = append(*errors, te)
					}
				} else if value != nil {
					s.freeze[path] = leaf
				}
			}
			if s.schema != nil {
				if entry := s.schema.Get(path); entry != nil {
					matches := ValueMatchesType(value, entry.Type)
					bad := (entry.Polarity == PolarityAllow && !matches) ||
						(entry.Polarity == PolarityDeny && matches)
					if bad {
						te := &TypeError{
							Message:  "schema violation at " + path,
							Path:     path,
							Expected: entry.Type,
							Actual:   classifySafe(value),
							Polarity: entry.Polarity,
						}
						if s.onViolation != nil {
							s.onViolation(te)
						}
						*errors = append(*errors, te)
					}
				}
			}
		}
	}
	switch v := value.(type) {
	case map[string]any:
		for k, child := range v {
			s.walkObserve(child, append(append([]any{}, segs...), k), errors)
		}
	case []any:
		for i, child := range v {
			s.walkObserve(child, append(append([]any{}, segs...), i), errors)
		}
	}
}

// ReconcileCommit drops freeze entries absent from commit.
func (s *TypeFreezeSession) ReconcileCommit(commit any) {
	if commit == nil {
		s.freeze = map[string]map[string]any{}
		return
	}
	present := map[string]struct{}{}
	collectPaths(unwrapFragment(commit), nil, present)
	for key := range s.freeze {
		if _, ok := present[key]; !ok {
			delete(s.freeze, key)
		}
	}
}

func collectPaths(value any, segs []any, present map[string]struct{}) {
	if len(segs) > 0 {
		present[formatJSONPath(segs)] = struct{}{}
	}
	switch v := value.(type) {
	case map[string]any:
		for k, child := range v {
			collectPaths(child, append(append([]any{}, segs...), k), present)
		}
	case []any:
		for i, child := range v {
			collectPaths(child, append(append([]any{}, segs...), i), present)
		}
	}
}

func pathEscapes(path string, escapePaths []string) bool {
	for _, e := range escapePaths {
		if e == "" {
			return true
		}
		if path == e || hasPathPrefix(path, e) {
			return true
		}
	}
	return false
}
