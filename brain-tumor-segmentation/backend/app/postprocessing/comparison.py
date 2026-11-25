"""Voxel-wise comparison metrics for predicted and reference tumor masks."""
import numpy as np


def compare_masks(predicted, reference):
    predicted_tumor = np.asarray(predicted) > 0
    reference_tumor = np.asarray(reference) > 0
    if predicted_tumor.shape != reference_tumor.shape:
        raise ValueError("Predicted and reference masks must have the same shape.")

    true_positive = int(np.count_nonzero(predicted_tumor & reference_tumor))
    false_positive = int(np.count_nonzero(predicted_tumor & ~reference_tumor))
    false_negative = int(np.count_nonzero(~predicted_tumor & reference_tumor))
    true_negative = int(predicted_tumor.size - true_positive - false_positive - false_negative)
    predicted_count = true_positive + false_positive
    reference_count = true_positive + false_negative
    union = true_positive + false_positive + false_negative
    dice_denominator = predicted_count + reference_count

    return {
        "dice": 1.0 if dice_denominator == 0 else 2 * true_positive / dice_denominator,
        "iou": 1.0 if union == 0 else true_positive / union,
        "precision": 1.0 if predicted_count == 0 and reference_count == 0 else
                     (true_positive / predicted_count if predicted_count else 0.0),
        "sensitivity": 1.0 if predicted_count == 0 and reference_count == 0 else
                       (true_positive / reference_count if reference_count else 0.0),
        "voxel_accuracy": (true_positive + true_negative) / predicted_tumor.size,
        "true_positive_voxels": true_positive,
        "false_positive_voxels": false_positive,
        "false_negative_voxels": false_negative,
    }
