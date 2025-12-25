'use client';

import React from 'react';
import { CheckCircle, Clock, Lock, Target, TrendingUp, Zap } from 'lucide-react';
import { LearningProgress } from '@/types';

interface SkillTreePanelProps {
  progress: LearningProgress[];
  onConceptSelect: (conceptId: string) => void;
  selectedConcept: string | null;
}

interface ConceptNode {
  id: string;
  name: string;
  description: string;
  prerequisites: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedTime: string;
}

export const SKILL_CONCEPTS: ConceptNode[] = [
  {
    id: 'basic_functions',
    name: 'Basic Functions',
    description: 'SUM, AVERAGE, COUNT, MIN, MAX',
    prerequisites: [],
    difficulty: 'beginner',
    estimatedTime: '30 min'
  },
  {
    id: 'cell_references',
    name: 'Cell References',
    description: 'Absolute vs Relative references',
    prerequisites: ['basic_functions'],
    difficulty: 'beginner',
    estimatedTime: '20 min'
  },
  {
    id: 'logical_functions',
    name: 'Logical Functions',
    description: 'IF, AND, OR statements',
    prerequisites: ['basic_functions'],
    difficulty: 'intermediate',
    estimatedTime: '45 min'
  },
  {
    id: 'vlookup',
    name: 'VLOOKUP',
    description: 'Lookup and reference data',
    prerequisites: ['basic_functions', 'cell_references'],
    difficulty: 'intermediate',
    estimatedTime: '60 min'
  },
  {
    id: 'pivot_tables',
    name: 'Pivot Tables',
    description: 'Data summarization and analysis',
    prerequisites: ['basic_functions', 'logical_functions'],
    difficulty: 'advanced',
    estimatedTime: '90 min'
  },
  {
    id: 'advanced_formulas',
    name: 'Advanced Formulas',
    description: 'INDEX, MATCH, complex nested functions',
    prerequisites: ['vlookup', 'logical_functions'],
    difficulty: 'advanced',
    estimatedTime: '120 min'
  }
];

export default function SkillTreePanel({ progress, onConceptSelect, selectedConcept }: SkillTreePanelProps) {

  const getSkillLevel = (conceptId: string) => {
    const skillProgress = progress.find(p => p.concept_id === conceptId);
    return skillProgress?.skill_level || 'novice';
  };

  const isUnlocked = (concept: ConceptNode) => {
    if (concept.prerequisites.length === 0) return true;

    return concept.prerequisites.every(prereq => {
      const prereqSkill = getSkillLevel(prereq);
      return prereqSkill === 'proficient' || prereqSkill === 'mastered';
    });
  };

  const getStatusIcon = (concept: ConceptNode) => {
    const skillLevel = getSkillLevel(concept.id);
    const unlocked = isUnlocked(concept);

    if (!unlocked) {
      return <Lock className="w-5 h-5 text-white/40" />;
    }

    switch (skillLevel) {
      case 'mastered':
        return <CheckCircle className="w-5 h-5 text-white" />;
      case 'proficient':
        return <TrendingUp className="w-5 h-5 text-white" />;
      case 'practicing':
        return <Clock className="w-5 h-5 text-white/80" />;
      default:
        return <Target className="w-5 h-5 text-white/70" />;
    }
  };

  const getStatusColor = (concept: ConceptNode) => {
    const skillLevel = getSkillLevel(concept.id);
    const unlocked = isUnlocked(concept);

    if (!unlocked) {
      return {
        border: 'border-border',
        bg: 'bg-black/20',
        text: 'text-white/40'
      };
    }

    switch (skillLevel) {
      case 'mastered':
        return {
          border: 'border-white/40',
          bg: 'bg-white/10',
          text: 'text-white'
        };
      case 'proficient':
        return {
          border: 'border-white/30',
          bg: 'bg-white/5',
          text: 'text-white/90'
        };
      case 'practicing':
        return {
          border: 'border-white/20',
          bg: 'bg-white/5',
          text: 'text-white/80'
        };
      default:
        return {
          border: 'border-border',
          bg: 'bg-black/40',
          text: 'text-white/70'
        };
    }
  };

  const getProgressWidth = (concept: ConceptNode) => {
    const skillLevel = getSkillLevel(concept.id);
    switch (skillLevel) {
      case 'mastered': return 'w-full';
      case 'proficient': return 'w-3/4';
      case 'practicing': return 'w-1/2';
      case 'novice': return 'w-1/4';
      default: return 'w-0';
    }
  };

  const getDifficultyColor = () => {
    return 'text-white/80 bg-white/10';
  };

  return (
    <div className="w-80 bg-card/40 backdrop-blur-sm border-r border-border overflow-y-auto">
      <div className="p-6">
        <div className="flex items-center space-x-2 mb-6">
          <Zap className="w-6 h-6 text-white" />
          <h2 className="text-lg font-semibold text-white">Skill Tree</h2>
        </div>

        {/* Overall Progress */}
        <div className="mb-6 p-4 bg-black/40 rounded-lg border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-white">Overall Progress</span>
            <span className="text-sm text-white/80">
              {progress.filter(p => p.skill_level === 'mastered').length}/{SKILL_CONCEPTS.length}
            </span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-2">
            <div
              className="bg-white h-2 rounded-full transition-all duration-500"
              style={{
                width: `${(progress.filter(p => p.skill_level === 'mastered').length / SKILL_CONCEPTS.length) * 100}%`
              }}
            ></div>
          </div>
        </div>

        {/* Skill Nodes */}
        <div className="space-y-4">
          {SKILL_CONCEPTS.map((concept, index) => {
            const colors = getStatusColor(concept);
            const unlocked = isUnlocked(concept);
            const isSelected = selectedConcept === concept.id;

            return (
              <div key={concept.id} className="relative">
                {/* Connection Line */}
                {index < SKILL_CONCEPTS.length - 1 && (
                  <div className="absolute left-6 top-16 w-px h-8 bg-white/10"></div>
                )}

                <div
                  onClick={() => unlocked && onConceptSelect(concept.id)}
                  className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                    isSelected
                      ? 'border-white/50 bg-white/10'
                      : `${colors.border} ${colors.bg} ${unlocked ? 'hover:border-white/30 cursor-pointer' : 'cursor-not-allowed'}`
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 mt-1">
                      {getStatusIcon(concept)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className={`font-medium text-sm ${colors.text}`}>
                          {concept.name}
                        </h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getDifficultyColor()}`}>
                          {concept.difficulty}
                        </span>
                      </div>

                      <p className="text-xs text-white/60 mb-2">
                        {concept.description}
                      </p>

                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-white/50 flex items-center">
                          <Clock className="w-3 h-3 mr-1" />
                          {concept.estimatedTime}
                        </span>
                      </div>

                      {/* Progress Bar */}
                      {unlocked && (
                        <div className="w-full bg-white/10 rounded-full h-1.5">
                          <div className={`bg-white h-1.5 rounded-full transition-all duration-300 ${getProgressWidth(concept)}`}></div>
                        </div>
                      )}

                      {/* Prerequisites */}
                      {concept.prerequisites.length > 0 && (
                        <div className="mt-2 text-xs text-white/50">
                          Requires: {concept.prerequisites.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-6 p-4 bg-black/40 rounded-lg border border-border">
          <h4 className="text-sm font-medium text-white mb-3">Status Legend</h4>
          <div className="space-y-2 text-xs text-white/80">
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 text-white" />
              <span>Mastered</span>
            </div>
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-white" />
              <span>Proficient</span>
            </div>
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-white/80" />
              <span>Practicing</span>
            </div>
            <div className="flex items-center space-x-2">
              <Target className="w-4 h-4 text-white/70" />
              <span>Ready to Learn</span>
            </div>
            <div className="flex items-center space-x-2">
              <Lock className="w-4 h-4 text-white/40" />
              <span>Locked</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}